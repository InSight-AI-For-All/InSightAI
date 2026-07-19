create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  avatar_url text,
  plan text not null default 'free' check (plan in ('free', 'starter')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.usage_counters (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  free_used integer not null default 0 check (free_used >= 0),
  monthly_used integer not null default 0 check (monthly_used >= 0),
  reset_at timestamptz not null default (date_trunc('month', now()) + interval '1 month'),
  updated_at timestamptz not null default now()
);

create table public.fact_checks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  input_type text not null check (input_type in ('text', 'link', 'screenshot')),
  raw_text text,
  submitted_url text,
  screenshot_path text,
  verdict text not null,
  truth_score integer check (truth_score between 0 and 100),
  confidence_score integer not null check (confidence_score between 0 and 100),
  category text not null,
  claim_type text not null,
  summary text not null,
  analysis_json jsonb not null,
  created_at timestamptz not null default now()
);

create index fact_checks_user_created_idx
  on public.fact_checks(user_id, created_at desc);
create index fact_checks_user_verdict_idx on public.fact_checks(user_id, verdict);
create index fact_checks_user_category_idx on public.fact_checks(user_id, category);

create table public.fact_check_reservations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  idempotency_key uuid not null,
  status text not null default 'reserved' check (status in ('reserved', 'completed', 'released')),
  fact_check_id uuid references public.fact_checks(id) on delete set null,
  expires_at timestamptz not null default (now() + interval '10 minutes'),
  created_at timestamptz not null default now(),
  unique (user_id, idempotency_key)
);

create index fact_check_reservations_active_idx
  on public.fact_check_reservations(user_id, status, expires_at);

create table public.subscriptions (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  plan text not null default 'free' check (plan in ('free', 'starter')),
  status text not null default 'inactive',
  current_period_start timestamptz,
  current_period_end timestamptz,
  stripe_event_created bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    coalesce(new.email, ''),
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'avatar_url'
  );
  insert into public.usage_counters (user_id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

revoke all on function public.handle_new_user() from public;

insert into public.profiles (id, email, full_name, avatar_url)
select
  id,
  coalesce(email, ''),
  raw_user_meta_data ->> 'full_name',
  raw_user_meta_data ->> 'avatar_url'
from auth.users
on conflict (id) do nothing;

insert into public.usage_counters (user_id)
select id from public.profiles
on conflict (user_id) do nothing;

create or replace function public.reserve_fact_check(p_user_id uuid, p_idempotency_key uuid)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
  current_user_id uuid := p_user_id;
  current_plan text;
  usage_row public.usage_counters%rowtype;
  existing public.fact_check_reservations%rowtype;
  reservation_id uuid;
  active_reservations integer;
  used_count integer;
  usage_limit integer;
begin
  if current_user_id is null or not exists (select 1 from public.profiles where id = current_user_id) then
    raise exception 'invalid_user';
  end if;
  perform pg_advisory_xact_lock(hashtext(current_user_id::text));

  select * into existing from public.fact_check_reservations
    where user_id = current_user_id and idempotency_key = p_idempotency_key;
  if found then
    return jsonb_build_object(
      'allowed', existing.status <> 'released',
      'status', existing.status,
      'reservationId', existing.id,
      'factCheckId', existing.fact_check_id
    );
  end if;

  update public.fact_check_reservations set status = 'released'
    where user_id = current_user_id and status = 'reserved' and expires_at <= now();

  select plan into current_plan from public.profiles where id = current_user_id;
  select * into usage_row from public.usage_counters where user_id = current_user_id for update;

  if current_plan = 'starter' and usage_row.reset_at <= now() then
    update public.usage_counters
      set monthly_used = 0,
          reset_at = date_trunc('month', now()) + interval '1 month',
          updated_at = now()
      where user_id = current_user_id returning * into usage_row;
  end if;

  select count(*) into active_reservations from public.fact_check_reservations
    where user_id = current_user_id and status = 'reserved' and expires_at > now();

  used_count := case when current_plan = 'starter' then usage_row.monthly_used else usage_row.free_used end;
  usage_limit := case when current_plan = 'starter' then 1000 else 5 end;

  if used_count + active_reservations >= usage_limit then
    return jsonb_build_object('allowed', false, 'status', 'limit_reached', 'used', used_count, 'limit', usage_limit);
  end if;

  insert into public.fact_check_reservations (user_id, idempotency_key)
    values (current_user_id, p_idempotency_key) returning id into reservation_id;
  return jsonb_build_object('allowed', true, 'status', 'reserved', 'reservationId', reservation_id);
end;
$$;

create or replace function public.complete_fact_check(
  p_user_id uuid,
  p_reservation_id uuid,
  p_input_type text,
  p_raw_text text,
  p_submitted_url text,
  p_screenshot_path text,
  p_result jsonb
)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  current_user_id uuid := p_user_id;
  current_plan text;
  reservation public.fact_check_reservations%rowtype;
  new_fact_check_id uuid;
begin
  if current_user_id is null then raise exception 'invalid_user'; end if;
  perform pg_advisory_xact_lock(hashtext(current_user_id::text));
  select * into reservation from public.fact_check_reservations
    where id = p_reservation_id and user_id = current_user_id for update;
  if not found or reservation.status = 'released' or reservation.expires_at <= now() then
    raise exception 'invalid_reservation';
  end if;
  if reservation.status = 'completed' then return reservation.fact_check_id; end if;

  insert into public.fact_checks (
    user_id, input_type, raw_text, submitted_url, screenshot_path, verdict,
    truth_score, confidence_score, category, claim_type, summary, analysis_json
  ) values (
    current_user_id, p_input_type, nullif(p_raw_text, ''), nullif(p_submitted_url, ''),
    nullif(p_screenshot_path, ''), p_result ->> 'verdict',
    (p_result ->> 'truthScore')::integer, (p_result ->> 'confidenceScore')::integer,
    p_result ->> 'category', p_result ->> 'claimType', p_result ->> 'summary', p_result
  ) returning id into new_fact_check_id;

  select plan into current_plan from public.profiles where id = current_user_id;
  update public.usage_counters set
    free_used = free_used + case when current_plan = 'free' then 1 else 0 end,
    monthly_used = monthly_used + case when current_plan = 'starter' then 1 else 0 end,
    updated_at = now()
  where user_id = current_user_id;

  update public.fact_check_reservations
    set status = 'completed', fact_check_id = new_fact_check_id
    where id = p_reservation_id;
  return new_fact_check_id;
end;
$$;

create or replace function public.release_fact_check(p_user_id uuid, p_reservation_id uuid)
returns void
language sql
security definer set search_path = public
as $$
  update public.fact_check_reservations set status = 'released'
  where id = p_reservation_id and user_id = p_user_id and status = 'reserved';
$$;

create or replace function public.sync_stripe_subscription(
  p_user_id uuid,
  p_customer_id text,
  p_subscription_id text,
  p_plan text,
  p_status text,
  p_period_start timestamptz,
  p_period_end timestamptz,
  p_event_created bigint
)
returns boolean
language plpgsql
security definer set search_path = public
as $$
declare
  affected_rows integer;
begin
  if p_plan not in ('free', 'starter') then raise exception 'invalid_plan'; end if;
  if not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'profile_not_found';
  end if;

  insert into public.subscriptions (
    user_id, stripe_customer_id, stripe_subscription_id, plan, status,
    current_period_start, current_period_end, stripe_event_created, updated_at
  ) values (
    p_user_id, p_customer_id, p_subscription_id, p_plan, p_status,
    p_period_start, p_period_end, p_event_created, now()
  )
  on conflict (user_id) do update set
    stripe_customer_id = excluded.stripe_customer_id,
    stripe_subscription_id = excluded.stripe_subscription_id,
    plan = excluded.plan,
    status = excluded.status,
    current_period_start = excluded.current_period_start,
    current_period_end = excluded.current_period_end,
    stripe_event_created = excluded.stripe_event_created,
    updated_at = now()
  where public.subscriptions.stripe_event_created <= excluded.stripe_event_created;

  get diagnostics affected_rows = row_count;
  if affected_rows = 0 then return false; end if;

  update public.profiles set plan = p_plan, updated_at = now() where id = p_user_id;
  return true;
end;
$$;

alter table public.profiles enable row level security;
alter table public.usage_counters enable row level security;
alter table public.fact_checks enable row level security;
alter table public.fact_check_reservations enable row level security;
alter table public.subscriptions enable row level security;

create policy "profiles_select_own" on public.profiles for select using (auth.uid() = id);
create policy "profiles_update_own" on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);
create policy "usage_select_own" on public.usage_counters for select using (auth.uid() = user_id);
create policy "fact_checks_select_own" on public.fact_checks for select using (auth.uid() = user_id);
create policy "subscriptions_select_own" on public.subscriptions for select using (auth.uid() = user_id);

grant usage on schema public to authenticated;
grant select on public.profiles, public.usage_counters, public.fact_checks, public.subscriptions
  to authenticated;

revoke all on function public.reserve_fact_check(uuid, uuid) from public;
revoke all on function public.complete_fact_check(uuid, uuid, text, text, text, text, jsonb) from public;
revoke all on function public.release_fact_check(uuid, uuid) from public;
revoke all on function public.sync_stripe_subscription(uuid, text, text, text, text, timestamptz, timestamptz, bigint) from public;
grant execute on function public.reserve_fact_check(uuid, uuid) to service_role;
grant execute on function public.complete_fact_check(uuid, uuid, text, text, text, text, jsonb) to service_role;
grant execute on function public.release_fact_check(uuid, uuid) to service_role;
grant execute on function public.sync_stripe_subscription(uuid, text, text, text, text, timestamptz, timestamptz, bigint) to service_role;

revoke update on public.profiles from authenticated;
grant update (full_name, avatar_url, updated_at) on public.profiles to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('screenshots', 'screenshots', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "screenshots_insert_own" on storage.objects for insert to authenticated
  with check (bucket_id = 'screenshots' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "screenshots_select_own" on storage.objects for select to authenticated
  using (bucket_id = 'screenshots' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "screenshots_delete_own" on storage.objects for delete to authenticated
  using (bucket_id = 'screenshots' and (storage.foldername(name))[1] = auth.uid()::text);