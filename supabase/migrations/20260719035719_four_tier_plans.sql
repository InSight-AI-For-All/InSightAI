alter table public.profiles
	drop constraint profiles_plan_check;

alter table public.profiles
	add constraint profiles_plan_check
	check (plan in ('free', 'starter', 'pro', 'max'));

alter table public.subscriptions
	drop constraint subscriptions_plan_check;

alter table public.subscriptions
	add constraint subscriptions_plan_check
	check (plan in ('free', 'starter', 'pro', 'max'));

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

	if current_plan in ('starter', 'pro', 'max') and usage_row.reset_at <= now() then
		update public.usage_counters
			set monthly_used = 0,
					reset_at = date_trunc('month', now()) + interval '1 month',
					updated_at = now()
			where user_id = current_user_id returning * into usage_row;
	end if;

	select count(*) into active_reservations from public.fact_check_reservations
		where user_id = current_user_id and status = 'reserved' and expires_at > now();

	used_count := case when current_plan = 'free' then usage_row.free_used else usage_row.monthly_used end;
	usage_limit := case current_plan
		when 'starter' then 20
		when 'pro' then 80
		when 'max' then 180
		else 3
	end;

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
	if reservation.status = 'charged' then raise exception 'attempt_already_charged'; end if;

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
		monthly_used = monthly_used + case when current_plan in ('starter', 'pro', 'max') then 1 else 0 end,
		updated_at = now()
	where user_id = current_user_id;

	update public.fact_check_reservations
		set status = 'completed', fact_check_id = new_fact_check_id
		where id = p_reservation_id;
	return new_fact_check_id;
end;
$$;

create or replace function public.charge_fact_check_attempt(p_user_id uuid, p_reservation_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
	current_user_id uuid := p_user_id;
	current_plan text;
	reservation public.fact_check_reservations%rowtype;
begin
	if current_user_id is null then raise exception 'invalid_user'; end if;
	perform pg_advisory_xact_lock(hashtext(current_user_id::text));

	select * into reservation from public.fact_check_reservations
		where id = p_reservation_id and user_id = current_user_id for update;
	if not found or reservation.status = 'released' or reservation.expires_at <= now() then
		raise exception 'invalid_reservation';
	end if;
	if reservation.status in ('completed', 'charged') then return; end if;

	select plan into current_plan from public.profiles where id = current_user_id;
	update public.usage_counters set
		free_used = free_used + case when current_plan = 'free' then 1 else 0 end,
		monthly_used = monthly_used + case when current_plan in ('starter', 'pro', 'max') then 1 else 0 end,
		updated_at = now()
	where user_id = current_user_id;

	update public.fact_check_reservations set status = 'charged' where id = p_reservation_id;
end;
$$;

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
	if p_plan not in ('free', 'starter', 'pro', 'max') then raise exception 'invalid_plan'; end if;
	if not exists (select 1 from public.profiles where id = p_user_id) then raise exception 'profile_not_found'; end if;

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

revoke all on function public.reserve_fact_check(uuid, uuid) from public, anon, authenticated;
revoke all on function public.complete_fact_check(uuid, uuid, text, text, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.charge_fact_check_attempt(uuid, uuid) from public, anon, authenticated;
revoke all on function public.sync_stripe_subscription(text, uuid, text, text, text, text, timestamptz, timestamptz, bigint) from public, anon, authenticated;

grant execute on function public.reserve_fact_check(uuid, uuid) to service_role;
grant execute on function public.complete_fact_check(uuid, uuid, text, text, text, text, jsonb) to service_role;
grant execute on function public.charge_fact_check_attempt(uuid, uuid) to service_role;
grant execute on function public.sync_stripe_subscription(text, uuid, text, text, text, text, timestamptz, timestamptz, bigint) to service_role;
