alter table public.profiles
	add column if not exists role text not null default 'user'
		check (role in ('user', 'admin')),
	add column if not exists last_active_at timestamptz;

create index if not exists profiles_role_idx on public.profiles(role);
create index if not exists profiles_last_active_idx on public.profiles(last_active_at desc);

create table public.telemetry_events (
	id bigint generated always as identity primary key,
	event_name text not null check (length(event_name) between 1 and 120),
	event_category text not null check (event_category in ('acquisition', 'auth', 'navigation', 'product', 'billing', 'admin', 'system')),
	user_id uuid references public.profiles(id) on delete set null,
	session_id uuid,
	request_id text,
	page text,
	environment text not null default 'production' check (environment in ('development', 'test', 'preview', 'production')),
	device_type text,
	browser text,
	operating_system text,
	referrer_host text,
	utm_source text,
	utm_medium text,
	utm_campaign text,
	metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
	created_at timestamptz not null default now()
);

create index telemetry_events_created_idx on public.telemetry_events(created_at desc);
create index telemetry_events_name_created_idx on public.telemetry_events(event_name, created_at desc);
create index telemetry_events_user_created_idx on public.telemetry_events(user_id, created_at desc) where user_id is not null;
create index telemetry_events_session_created_idx on public.telemetry_events(session_id, created_at desc) where session_id is not null;
create index telemetry_events_category_created_idx on public.telemetry_events(event_category, created_at desc);

create table public.error_logs (
	id bigint generated always as identity primary key,
	fingerprint text not null,
	error_type text not null check (error_type in ('client_error', 'api_error', 'database_error', 'auth_error', 'ai_error', 'search_error', 'payment_error', 'upload_error', 'unknown_error')),
	severity text not null check (severity in ('info', 'warning', 'error', 'critical')),
	message text not null,
	stack_trace text,
	endpoint text,
	page text,
	user_id uuid references public.profiles(id) on delete set null,
	session_id uuid,
	request_id text,
	browser text,
	device_type text,
	operating_system text,
	environment text not null default 'production',
	metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
	created_at timestamptz not null default now()
);

create index error_logs_created_idx on public.error_logs(created_at desc);
create index error_logs_fingerprint_created_idx on public.error_logs(fingerprint, created_at desc);
create index error_logs_type_created_idx on public.error_logs(error_type, created_at desc);
create index error_logs_severity_created_idx on public.error_logs(severity, created_at desc);
create index error_logs_endpoint_created_idx on public.error_logs(endpoint, created_at desc) where endpoint is not null;
create index error_logs_user_created_idx on public.error_logs(user_id, created_at desc) where user_id is not null;

create table public.api_logs (
	id bigint generated always as identity primary key,
	endpoint text not null,
	method text not null check (method in ('GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD')),
	status_code integer not null check (status_code between 100 and 599),
	success boolean not null,
	latency_ms integer not null check (latency_ms >= 0),
	user_id uuid references public.profiles(id) on delete set null,
	session_id uuid,
	request_id text,
	error_type text,
	error_code text,
	environment text not null default 'production',
	metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
	created_at timestamptz not null default now()
);

create index api_logs_created_idx on public.api_logs(created_at desc);
create index api_logs_endpoint_created_idx on public.api_logs(endpoint, created_at desc);
create index api_logs_status_created_idx on public.api_logs(status_code, created_at desc);
create index api_logs_failure_created_idx on public.api_logs(created_at desc) where success = false;
create index api_logs_latency_idx on public.api_logs(latency_ms desc, created_at desc);

create table public.fact_check_logs (
	id uuid primary key default gen_random_uuid(),
	reservation_id uuid,
	fact_check_id uuid references public.fact_checks(id) on delete set null,
	user_id uuid references public.profiles(id) on delete set null,
	request_id text,
	session_id uuid,
	input_type text check (input_type in ('text', 'link', 'screenshot')),
	stage text not null,
	status text not null check (status in ('started', 'completed', 'failed', 'rejected')),
	category text,
	verdict text,
	truth_score integer check (truth_score between 0 and 100),
	confidence_score integer check (confidence_score between 0 and 100),
	duration_ms integer check (duration_ms >= 0),
	error_code text,
	error_reason text,
	environment text not null default 'production',
	metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
	started_at timestamptz not null default now(),
	completed_at timestamptz,
	created_at timestamptz not null default now()
);

create index fact_check_logs_created_idx on public.fact_check_logs(created_at desc);
create index fact_check_logs_user_created_idx on public.fact_check_logs(user_id, created_at desc) where user_id is not null;
create index fact_check_logs_status_created_idx on public.fact_check_logs(status, created_at desc);
create index fact_check_logs_stage_created_idx on public.fact_check_logs(stage, created_at desc);
create index fact_check_logs_category_created_idx on public.fact_check_logs(category, created_at desc) where category is not null;
create index fact_check_logs_fact_check_idx on public.fact_check_logs(fact_check_id) where fact_check_id is not null;

create table public.ai_usage_logs (
	id bigint generated always as identity primary key,
	fact_check_log_id uuid references public.fact_check_logs(id) on delete set null,
	user_id uuid references public.profiles(id) on delete set null,
	request_id text,
	provider text not null default 'openai',
	model text not null,
	request_type text not null,
	stage text not null,
	status text not null check (status in ('started', 'completed', 'failed')),
	latency_ms integer check (latency_ms >= 0),
	prompt_tokens integer not null default 0 check (prompt_tokens >= 0),
	cached_prompt_tokens integer not null default 0 check (cached_prompt_tokens >= 0),
	completion_tokens integer not null default 0 check (completion_tokens >= 0),
	total_tokens integer generated always as (prompt_tokens + completion_tokens) stored,
	estimated_cost_usd numeric(14, 8) not null default 0 check (estimated_cost_usd >= 0),
	retry_count integer not null default 0 check (retry_count >= 0),
	json_parse_failure boolean not null default false,
	refusal boolean not null default false,
	timed_out boolean not null default false,
	error_code text,
	metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
	created_at timestamptz not null default now()
);

create index ai_usage_logs_created_idx on public.ai_usage_logs(created_at desc);
create index ai_usage_logs_model_created_idx on public.ai_usage_logs(model, created_at desc);
create index ai_usage_logs_status_created_idx on public.ai_usage_logs(status, created_at desc);
create index ai_usage_logs_user_created_idx on public.ai_usage_logs(user_id, created_at desc) where user_id is not null;
create index ai_usage_logs_cost_created_idx on public.ai_usage_logs(estimated_cost_usd desc, created_at desc);

create table public.web_search_logs (
	id bigint generated always as identity primary key,
	ai_usage_log_id bigint references public.ai_usage_logs(id) on delete set null,
	fact_check_log_id uuid references public.fact_check_logs(id) on delete set null,
	user_id uuid references public.profiles(id) on delete set null,
	request_id text,
	status text not null check (status in ('started', 'completed', 'failed')),
	query_count integer not null default 0 check (query_count >= 0),
	source_count integer not null default 0 check (source_count >= 0),
	citation_count integer not null default 0 check (citation_count >= 0),
	latency_ms integer check (latency_ms >= 0),
	failure_reason text,
	metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
	created_at timestamptz not null default now()
);

create index web_search_logs_created_idx on public.web_search_logs(created_at desc);
create index web_search_logs_status_created_idx on public.web_search_logs(status, created_at desc);
create index web_search_logs_user_created_idx on public.web_search_logs(user_id, created_at desc) where user_id is not null;

create table public.billing_events (
	id bigint generated always as identity primary key,
	provider_event_id text unique,
	event_name text not null,
	user_id uuid references public.profiles(id) on delete set null,
	request_id text,
	plan text,
	subscription_status text,
	amount_cents integer check (amount_cents is null or amount_cents >= 0),
	currency text,
	success boolean not null default true,
	error_code text,
	metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
	created_at timestamptz not null default now()
);

create index billing_events_created_idx on public.billing_events(created_at desc);
create index billing_events_name_created_idx on public.billing_events(event_name, created_at desc);
create index billing_events_user_created_idx on public.billing_events(user_id, created_at desc) where user_id is not null;
create index billing_events_failure_created_idx on public.billing_events(created_at desc) where success = false;

create table public.performance_metrics (
	id bigint generated always as identity primary key,
	metric_name text not null check (metric_name in ('LCP', 'INP', 'CLS', 'FCP', 'TTFB', 'route_transition', 'database_latency', 'upload_latency')),
	value numeric(14, 4) not null check (value >= 0),
	rating text check (rating in ('good', 'needs-improvement', 'poor')),
	route text,
	user_id uuid references public.profiles(id) on delete set null,
	session_id uuid,
	browser text,
	device_type text,
	operating_system text,
	metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
	created_at timestamptz not null default now()
);

create index performance_metrics_created_idx on public.performance_metrics(created_at desc);
create index performance_metrics_name_created_idx on public.performance_metrics(metric_name, created_at desc);
create index performance_metrics_route_created_idx on public.performance_metrics(route, created_at desc) where route is not null;

create table public.admin_audit_logs (
	id bigint generated always as identity primary key,
	admin_user_id uuid references public.profiles(id) on delete set null,
	action text not null,
	target_type text,
	target_id text,
	request_id text,
	metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
	created_at timestamptz not null default now()
);

create index admin_audit_logs_created_idx on public.admin_audit_logs(created_at desc);
create index admin_audit_logs_admin_created_idx on public.admin_audit_logs(admin_user_id, created_at desc);
create index admin_audit_logs_action_created_idx on public.admin_audit_logs(action, created_at desc);

create table public.alert_rules (
	id text primary key,
	name text not null,
	metric text not null,
	comparison text not null check (comparison in ('above', 'below')),
	threshold numeric not null,
	window_minutes integer not null check (window_minutes between 1 and 10080),
	severity text not null check (severity in ('warning', 'critical')),
	enabled boolean not null default true,
	updated_at timestamptz not null default now()
);

create table public.alert_incidents (
	id bigint generated always as identity primary key,
	rule_id text references public.alert_rules(id) on delete set null,
	status text not null default 'open' check (status in ('open', 'acknowledged', 'resolved')),
	observed_value numeric,
	message text not null,
	acknowledged_by uuid references public.profiles(id) on delete set null,
	acknowledged_at timestamptz,
	resolved_at timestamptz,
	created_at timestamptz not null default now()
);

create index alert_incidents_status_created_idx on public.alert_incidents(status, created_at desc);

insert into public.alert_rules (id, name, metric, comparison, threshold, window_minutes, severity)
values
	('fact-check-success', 'Fact-check success rate', 'fact_check_success_rate', 'below', 90, 60, 'critical'),
	('ai-failure-rate', 'AI failure rate', 'ai_failure_rate', 'above', 10, 30, 'critical'),
	('search-failure-rate', 'Search failure rate', 'search_failure_rate', 'above', 15, 30, 'critical'),
	('payment-failure-rate', 'Payment failure rate', 'payment_failure_rate', 'above', 10, 60, 'warning'),
	('api-p95-latency', 'API p95 latency', 'api_p95_latency_ms', 'above', 5000, 15, 'warning'),
	('error-rate', 'Application error rate', 'error_count', 'above', 25, 15, 'critical')
on conflict (id) do nothing;

alter table public.telemetry_events enable row level security;
alter table public.error_logs enable row level security;
alter table public.api_logs enable row level security;
alter table public.fact_check_logs enable row level security;
alter table public.ai_usage_logs enable row level security;
alter table public.web_search_logs enable row level security;
alter table public.billing_events enable row level security;
alter table public.performance_metrics enable row level security;
alter table public.admin_audit_logs enable row level security;
alter table public.alert_rules enable row level security;
alter table public.alert_incidents enable row level security;

revoke all on table public.telemetry_events from public, anon, authenticated;
revoke all on table public.error_logs from public, anon, authenticated;
revoke all on table public.api_logs from public, anon, authenticated;
revoke all on table public.fact_check_logs from public, anon, authenticated;
revoke all on table public.ai_usage_logs from public, anon, authenticated;
revoke all on table public.web_search_logs from public, anon, authenticated;
revoke all on table public.billing_events from public, anon, authenticated;
revoke all on table public.performance_metrics from public, anon, authenticated;
revoke all on table public.admin_audit_logs from public, anon, authenticated;
revoke all on table public.alert_rules from public, anon, authenticated;
revoke all on table public.alert_incidents from public, anon, authenticated;

grant select, insert, update, delete on table public.telemetry_events to service_role;
grant select, insert, update, delete on table public.error_logs to service_role;
grant select, insert, update, delete on table public.api_logs to service_role;
grant select, insert, update, delete on table public.fact_check_logs to service_role;
grant select, insert, update, delete on table public.ai_usage_logs to service_role;
grant select, insert, update, delete on table public.web_search_logs to service_role;
grant select, insert, update, delete on table public.billing_events to service_role;
grant select, insert, update, delete on table public.performance_metrics to service_role;
grant select, insert, update, delete on table public.admin_audit_logs to service_role;
grant select, insert, update, delete on table public.alert_rules to service_role;
grant select, insert, update, delete on table public.alert_incidents to service_role;

grant usage, select on all sequences in schema public to service_role;

create or replace function public.get_admin_overview(p_days integer default 30)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
	with bounds as (
		select
			greatest(1, least(coalesce(p_days, 30), 365))::integer as days,
			now() - make_interval(days => greatest(1, least(coalesce(p_days, 30), 365))) as cutoff,
			date_trunc('day', now()) as today,
			now() - interval '24 hours' as day_cutoff,
			now() - interval '30 days' as month_cutoff
	),
	user_metrics as (
		select
			count(*)::integer as total_users,
			count(*) filter (where created_at >= (select today from bounds))::integer as new_users_today,
			count(*) filter (where plan = 'free')::integer as free_users,
			count(*) filter (where plan <> 'free')::integer as paid_users
		from public.profiles
	),
	active_metrics as (
		select
			count(distinct user_id) filter (where created_at >= (select day_cutoff from bounds))::integer as daily_active_users,
			count(distinct user_id) filter (where created_at >= (select month_cutoff from bounds))::integer as monthly_active_users
		from public.telemetry_events
		where user_id is not null
	),
	fact_metrics as (
		select
			count(*)::integer as attempts,
			count(*) filter (where created_at >= (select today from bounds))::integer as attempts_today,
			count(*) filter (where status = 'completed')::integer as completed,
			count(*) filter (where status = 'failed')::integer as failed,
			coalesce(round(100.0 * count(*) filter (where status = 'completed') / nullif(count(*) filter (where status in ('completed', 'failed')), 0), 1), 0) as success_rate,
			coalesce(round(100.0 * count(*) filter (where status = 'failed') / nullif(count(*) filter (where status in ('completed', 'failed')), 0), 1), 0) as failure_rate,
			coalesce(round(avg(duration_ms) filter (where status = 'completed')), 0)::integer as average_latency_ms
		from public.fact_check_logs
		where created_at >= (select cutoff from bounds)
	),
	ai_metrics as (
		select
			count(*) filter (where status in ('completed', 'failed'))::integer as requests,
			count(*) filter (where status = 'failed')::integer as failed,
			coalesce(round(100.0 * count(*) filter (where status = 'completed') / nullif(count(*) filter (where status in ('completed', 'failed')), 0), 1), 0) as success_rate,
			coalesce(round(avg(latency_ms) filter (where status = 'completed')), 0)::integer as average_latency_ms,
			coalesce(sum(total_tokens) filter (where status = 'completed'), 0)::bigint as total_tokens,
			coalesce(round(sum(estimated_cost_usd) filter (where status = 'completed'), 6), 0) as estimated_cost_usd,
			count(*) filter (where json_parse_failure)::integer as parse_failures
		from public.ai_usage_logs
		where created_at >= (select cutoff from bounds)
	),
	revenue_metrics as (
		select
			count(*) filter (where status in ('active', 'trialing'))::integer as active_subscriptions,
			count(*) filter (where status = 'canceled')::integer as canceled_subscriptions,
			coalesce(sum(case
				when status not in ('active', 'trialing') then 0
				when plan = 'starter' then 399
				when plan = 'pro' then 1299
				when plan = 'max' then 2499
				else 0
			end), 0)::integer as mrr_cents
		from public.subscriptions
	),
	error_metrics as (
		select count(*)::integer as errors_today
		from public.error_logs
		where created_at >= (select today from bounds)
	),
	common_error as (
		select message, count(*)::integer as occurrences
		from public.error_logs
		where created_at >= (select cutoff from bounds)
		group by fingerprint, message
		order by count(*) desc
		limit 1
	),
	daily as (
		select generate_series(
			date_trunc('day', now()) - make_interval(days => (select days - 1 from bounds)),
			date_trunc('day', now()),
			interval '1 day'
		) as day
	),
	trend as (
		select
			to_char(d.day, 'YYYY-MM-DD') as date,
			(select count(*) from public.profiles p where p.created_at >= d.day and p.created_at < d.day + interval '1 day')::integer as signups,
			(select count(*) from public.fact_check_logs f where f.created_at >= d.day and f.created_at < d.day + interval '1 day')::integer as fact_checks,
			(select count(*) from public.error_logs e where e.created_at >= d.day and e.created_at < d.day + interval '1 day')::integer as errors,
			(select coalesce(round(sum(a.estimated_cost_usd), 6), 0) from public.ai_usage_logs a where a.status = 'completed' and a.created_at >= d.day and a.created_at < d.day + interval '1 day') as ai_cost,
			(select coalesce(sum(b.amount_cents) filter (where b.event_name = 'invoice_paid' and b.success), 0) from public.billing_events b where b.created_at >= d.day and b.created_at < d.day + interval '1 day')::integer as revenue_cents
		from daily d
		order by d.day
	)
	select jsonb_build_object(
		'rangeDays', (select days from bounds),
		'users', to_jsonb(user_metrics),
		'active', to_jsonb(active_metrics),
		'factChecks', to_jsonb(fact_metrics),
		'ai', to_jsonb(ai_metrics),
		'revenue', to_jsonb(revenue_metrics),
		'errors', jsonb_build_object(
			'today', (select errors_today from error_metrics),
			'mostCommon', coalesce((select jsonb_build_object('message', message, 'occurrences', occurrences) from common_error), 'null'::jsonb)
		),
		'conversionRate', coalesce(round(100.0 * (select paid_users from user_metrics) / nullif((select total_users from user_metrics), 0), 1), 0),
		'health', case
			when (select success_rate from fact_metrics) < 80 or (select errors_today from error_metrics) >= 25 then 'critical'
			when (select success_rate from fact_metrics) < 90 or (select failed from ai_metrics) >= 5 then 'degraded'
			else 'healthy'
		end,
		'trend', coalesce((select jsonb_agg(to_jsonb(trend)) from trend), '[]'::jsonb)
	)
	from user_metrics, active_metrics, fact_metrics, ai_metrics, revenue_metrics, error_metrics;
$$;

revoke all on function public.get_admin_overview(integer) from public, anon, authenticated;
grant execute on function public.get_admin_overview(integer) to service_role;

create or replace function public.get_alert_metric(p_metric text, p_window_minutes integer)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
	cutoff timestamptz := now() - make_interval(mins => greatest(1, least(coalesce(p_window_minutes, 60), 10080)));
	result numeric;
begin
	case p_metric
		when 'fact_check_success_rate' then
			select coalesce(100.0 * count(*) filter (where status = 'completed') / nullif(count(*) filter (where status in ('completed', 'failed', 'rejected')), 0), 100) into result from public.fact_check_logs where created_at >= cutoff;
		when 'ai_failure_rate' then
			select coalesce(100.0 * count(*) filter (where status = 'failed') / nullif(count(*) filter (where status in ('completed', 'failed')), 0), 0) into result from public.ai_usage_logs where created_at >= cutoff;
		when 'search_failure_rate' then
			select coalesce(100.0 * count(*) filter (where status = 'failed') / nullif(count(*) filter (where status in ('completed', 'failed')), 0), 0) into result from public.web_search_logs where created_at >= cutoff;
		when 'payment_failure_rate' then
			select coalesce(100.0 * count(*) filter (where event_name = 'invoice_failed' or not success) / nullif(count(*) filter (where event_name in ('invoice_paid', 'invoice_failed')), 0), 0) into result from public.billing_events where created_at >= cutoff and event_name in ('invoice_paid', 'invoice_failed');
		when 'api_p95_latency_ms' then
			select coalesce(percentile_cont(0.95) within group (order by latency_ms), 0) into result from public.api_logs where created_at >= cutoff;
		when 'error_count' then
			select count(*) into result from public.error_logs where created_at >= cutoff;
		else
			raise exception 'Unsupported alert metric';
	end case;
	return round(result, 4);
end;
$$;

revoke all on function public.get_alert_metric(text, integer) from public, anon, authenticated;
grant execute on function public.get_alert_metric(text, integer) to service_role;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
	insert into public.profiles (id, email, full_name, avatar_url, last_active_at)
	values (
		new.id,
		coalesce(new.email, ''),
		new.raw_user_meta_data ->> 'full_name',
		new.raw_user_meta_data ->> 'avatar_url',
		now()
	)
	on conflict (id) do nothing;

	insert into public.usage_counters (user_id)
	values (new.id)
	on conflict (user_id) do nothing;

	insert into public.telemetry_events (event_name, event_category, user_id, environment, metadata)
	values ('signup_completed', 'auth', new.id, 'production', jsonb_build_object('provider', coalesce(new.raw_app_meta_data ->> 'provider', 'unknown')));
	return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;

comment on column public.telemetry_events.metadata is 'Allowlisted operational context only. Never store secrets, tokens, raw claim text, full URLs, or payment data.';
comment on column public.error_logs.stack_trace is 'Sanitized server or client stack trace. Admin-only; secrets and request payloads must be removed before insert.';
comment on table public.admin_audit_logs is 'Immutable application-level record of privileged admin actions.';
