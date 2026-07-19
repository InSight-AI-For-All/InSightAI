create table public.fact_check_cache (
	content_hash text primary key check (length(content_hash) = 64),
	result jsonb not null check (jsonb_typeof(result) = 'object'),
	input_type text not null check (input_type in ('text', 'link', 'screenshot')),
	category text,
	source_fact_check_id uuid references public.fact_checks(id) on delete set null,
	expires_at timestamptz not null,
	hit_count integer not null default 0 check (hit_count >= 0),
	last_hit_at timestamptz,
	created_at timestamptz not null default now(),
	updated_at timestamptz not null default now()
);

create index fact_check_cache_expires_idx on public.fact_check_cache(expires_at);
create index fact_check_cache_category_expires_idx on public.fact_check_cache(category, expires_at);

alter table public.fact_check_cache enable row level security;
revoke all on table public.fact_check_cache from public, anon, authenticated;
grant select, insert, update, delete on table public.fact_check_cache to service_role;

create or replace function public.mark_fact_check_cache_hit(p_content_hash text)
returns void
language sql
security invoker
set search_path = public
as $$
	update public.fact_check_cache
	set hit_count = hit_count + 1,
		last_hit_at = now(),
		updated_at = now()
	where content_hash = p_content_hash;
$$;

revoke all on function public.mark_fact_check_cache_hit(text) from public, anon, authenticated;
grant execute on function public.mark_fact_check_cache_hit(text) to service_role;

comment on table public.fact_check_cache is 'Exact normalized fact-check results only. No raw claims, URLs, screenshots, or user identifiers.';
