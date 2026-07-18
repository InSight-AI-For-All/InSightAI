create table public.fact_check_rate_limits (
	user_id uuid primary key references public.profiles(id) on delete cascade,
	request_count integer not null default 0 check (request_count >= 0),
	reset_at timestamptz not null,
	updated_at timestamptz not null default now()
);

alter table public.fact_check_rate_limits enable row level security;

create or replace function public.check_fact_check_rate_limit(p_user_id uuid)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
	current_count integer;
	current_reset_at timestamptz;
	current_time timestamptz := clock_timestamp();
begin
	if p_user_id is null or not exists (select 1 from public.profiles where id = p_user_id) then
		raise exception 'invalid_user';
	end if;

	perform pg_advisory_xact_lock(hashtextextended('rate:' || p_user_id::text, 0));

	insert into public.fact_check_rate_limits (user_id, request_count, reset_at, updated_at)
	values (p_user_id, 1, current_time + interval '1 minute', current_time)
	on conflict (user_id) do update set
		request_count = case
			when public.fact_check_rate_limits.reset_at <= current_time then 1
			else public.fact_check_rate_limits.request_count + 1
		end,
		reset_at = case
			when public.fact_check_rate_limits.reset_at <= current_time then current_time + interval '1 minute'
			else public.fact_check_rate_limits.reset_at
		end,
		updated_at = current_time
	returning request_count, reset_at into current_count, current_reset_at;

	return jsonb_build_object(
		'allowed', current_count <= 10,
		'remaining', greatest(0, 10 - current_count),
		'retryAfterSeconds', case
			when current_count <= 10 then 0
			else greatest(1, ceil(extract(epoch from current_reset_at - current_time))::integer)
		end
	);
end;
$$;

revoke all on function public.check_fact_check_rate_limit(uuid) from public;
grant execute on function public.check_fact_check_rate_limit(uuid) to service_role;

create table public.stripe_webhook_events (
	event_id text primary key,
	event_created bigint not null,
	processed_at timestamptz not null default now()
);

alter table public.stripe_webhook_events enable row level security;

drop function if exists public.sync_stripe_subscription(uuid, text, text, text, text, timestamptz, timestamptz, bigint);

create or replace function public.sync_stripe_subscription(
	p_event_id text,
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
	if nullif(trim(p_event_id), '') is null then raise exception 'invalid_event'; end if;
	if p_plan not in ('free', 'starter') then raise exception 'invalid_plan'; end if;
	if not exists (select 1 from public.profiles where id = p_user_id) then
		raise exception 'profile_not_found';
	end if;

	perform pg_advisory_xact_lock(hashtextextended('stripe:' || p_user_id::text, 0));

	insert into public.stripe_webhook_events (event_id, event_created)
	values (p_event_id, p_event_created)
	on conflict (event_id) do nothing;
	get diagnostics affected_rows = row_count;
	if affected_rows = 0 then return false; end if;

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

revoke all on function public.sync_stripe_subscription(text, uuid, text, text, text, text, timestamptz, timestamptz, bigint) from public;
grant execute on function public.sync_stripe_subscription(text, uuid, text, text, text, text, timestamptz, timestamptz, bigint) to service_role;
