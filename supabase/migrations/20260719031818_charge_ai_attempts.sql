alter table public.fact_check_reservations
	drop constraint fact_check_reservations_status_check;

alter table public.fact_check_reservations
	add constraint fact_check_reservations_status_check
	check (status in ('reserved', 'completed', 'released', 'charged'));

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
		monthly_used = monthly_used + case when current_plan = 'starter' then 1 else 0 end,
		updated_at = now()
	where user_id = current_user_id;

	update public.fact_check_reservations
		set status = 'charged'
		where id = p_reservation_id;
end;
$$;

revoke all on function public.charge_fact_check_attempt(uuid, uuid) from public;
grant execute on function public.charge_fact_check_attempt(uuid, uuid) to service_role;
