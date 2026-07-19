create or replace function public.reserve_fact_check(p_user_id uuid, p_idempotency_key uuid)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
	current_user_id uuid := p_user_id;
	current_plan text;
	current_role text;
	usage_row public.usage_counters%rowtype;
	existing public.fact_check_reservations%rowtype;
	reservation_id uuid;
	active_reservations integer;
	used_count integer;
	usage_limit integer;
begin
	if current_user_id is null then raise exception 'invalid_user'; end if;
	perform pg_advisory_xact_lock(hashtext(current_user_id::text));

	select plan, role into current_plan, current_role
	from public.profiles
	where id = current_user_id;
	if not found then raise exception 'invalid_user'; end if;

	select * into existing from public.fact_check_reservations
		where user_id = current_user_id and idempotency_key = p_idempotency_key;
	if found then
		return jsonb_build_object(
			'allowed', existing.status <> 'released',
			'status', existing.status,
			'reservationId', existing.id,
			'factCheckId', existing.fact_check_id,
			'unlimited', current_role = 'admin'
		);
	end if;

	update public.fact_check_reservations set status = 'released'
		where user_id = current_user_id and status = 'reserved' and expires_at <= now();

	if current_role = 'admin' then
		insert into public.fact_check_reservations (user_id, idempotency_key)
			values (current_user_id, p_idempotency_key) returning id into reservation_id;
		return jsonb_build_object(
			'allowed', true,
			'status', 'reserved',
			'reservationId', reservation_id,
			'unlimited', true
		);
	end if;

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
	return jsonb_build_object('allowed', true, 'status', 'reserved', 'reservationId', reservation_id, 'unlimited', false);
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
	current_role text;
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

	select plan, role into current_plan, current_role from public.profiles where id = current_user_id;
	if current_role <> 'admin' then
		update public.usage_counters set
			free_used = free_used + case when current_plan = 'free' then 1 else 0 end,
			monthly_used = monthly_used + case when current_plan in ('starter', 'pro', 'max') then 1 else 0 end,
			updated_at = now()
		where user_id = current_user_id;
	end if;

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
	current_role text;
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

	select plan, role into current_plan, current_role from public.profiles where id = current_user_id;
	if current_role <> 'admin' then
		update public.usage_counters set
			free_used = free_used + case when current_plan = 'free' then 1 else 0 end,
			monthly_used = monthly_used + case when current_plan in ('starter', 'pro', 'max') then 1 else 0 end,
			updated_at = now()
		where user_id = current_user_id;
	end if;

	update public.fact_check_reservations set status = 'charged' where id = p_reservation_id;
end;
$$;

revoke all on function public.reserve_fact_check(uuid, uuid) from public, anon, authenticated;
revoke all on function public.complete_fact_check(uuid, uuid, text, text, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.charge_fact_check_attempt(uuid, uuid) from public, anon, authenticated;

grant execute on function public.reserve_fact_check(uuid, uuid) to service_role;
grant execute on function public.complete_fact_check(uuid, uuid, text, text, text, text, jsonb) to service_role;
grant execute on function public.charge_fact_check_attempt(uuid, uuid) to service_role;
