revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.reserve_fact_check(uuid, uuid) from public, anon, authenticated;
revoke all on function public.complete_fact_check(uuid, uuid, text, text, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.release_fact_check(uuid, uuid) from public, anon, authenticated;
revoke all on function public.charge_fact_check_attempt(uuid, uuid) from public, anon, authenticated;
revoke all on function public.check_fact_check_rate_limit(uuid) from public, anon, authenticated;
revoke all on function public.sync_stripe_subscription(text, uuid, text, text, text, text, timestamptz, timestamptz, bigint) from public, anon, authenticated;

grant execute on function public.reserve_fact_check(uuid, uuid) to service_role;
grant execute on function public.complete_fact_check(uuid, uuid, text, text, text, text, jsonb) to service_role;
grant execute on function public.release_fact_check(uuid, uuid) to service_role;
grant execute on function public.charge_fact_check_attempt(uuid, uuid) to service_role;
grant execute on function public.check_fact_check_rate_limit(uuid) to service_role;
grant execute on function public.sync_stripe_subscription(text, uuid, text, text, text, text, timestamptz, timestamptz, bigint) to service_role;
