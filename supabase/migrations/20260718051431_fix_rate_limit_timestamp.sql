create or replace function public.check_fact_check_rate_limit(p_user_id uuid)
returns jsonb
language plpgsql
security definer set search_path = public
as $$
declare
	current_count integer;
	current_reset_at timestamptz;
	v_now timestamptz := clock_timestamp();
begin
	if p_user_id is null or not exists (select 1 from public.profiles where id = p_user_id) then
		raise exception 'invalid_user';
	end if;

	perform pg_advisory_xact_lock(hashtextextended('rate:' || p_user_id::text, 0));

	insert into public.fact_check_rate_limits (user_id, request_count, reset_at, updated_at)
	values (p_user_id, 1, v_now + interval '1 minute', v_now)
	on conflict (user_id) do update set
		request_count = case
			when public.fact_check_rate_limits.reset_at <= v_now then 1
			else public.fact_check_rate_limits.request_count + 1
		end,
		reset_at = case
			when public.fact_check_rate_limits.reset_at <= v_now then v_now + interval '1 minute'
			else public.fact_check_rate_limits.reset_at
		end,
		updated_at = v_now
	returning request_count, reset_at into current_count, current_reset_at;

	return jsonb_build_object(
		'allowed', current_count <= 10,
		'remaining', greatest(0, 10 - current_count),
		'retryAfterSeconds', case
			when current_count <= 10 then 0
			else greatest(1, ceil(extract(epoch from current_reset_at - v_now))::integer)
		end
	);
end;
$$;

revoke all on function public.check_fact_check_rate_limit(uuid) from public;
grant execute on function public.check_fact_check_rate_limit(uuid) to service_role;
