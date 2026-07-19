alter table public.profiles
	alter column email drop not null,
	add column if not exists phone text,
	add column if not exists auth_provider text not null default 'email',
	add column if not exists auth_providers text[] not null default '{}'::text[];

create index if not exists profiles_email_idx on public.profiles(lower(email)) where email is not null;
create index if not exists profiles_phone_idx on public.profiles(phone) where phone is not null;
create index if not exists profiles_auth_provider_idx on public.profiles(auth_provider);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
	provider_name text := coalesce(
		new.raw_app_meta_data ->> 'provider',
		case when new.phone is not null then 'phone' else 'email' end
	);
	provider_names text[];
begin
	select coalesce(array_agg(value), array[provider_name])
	into provider_names
	from jsonb_array_elements_text(coalesce(new.raw_app_meta_data -> 'providers', '[]'::jsonb)) as providers(value);

	insert into public.profiles (
		id, email, phone, full_name, avatar_url, auth_provider, auth_providers, last_active_at
	)
	values (
		new.id,
		new.email,
		new.phone,
		coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
		coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture'),
		provider_name,
		provider_names,
		now()
	)
	on conflict (id) do update set
		email = excluded.email,
		phone = excluded.phone,
		full_name = coalesce(excluded.full_name, public.profiles.full_name),
		avatar_url = coalesce(excluded.avatar_url, public.profiles.avatar_url),
		auth_provider = excluded.auth_provider,
		auth_providers = excluded.auth_providers,
		updated_at = now();

	insert into public.usage_counters (user_id)
	values (new.id)
	on conflict (user_id) do nothing;

	insert into public.telemetry_events (event_name, event_category, user_id, environment, metadata)
	values ('signup_completed', 'auth', new.id, 'production', jsonb_build_object('provider', provider_name));
	return new;
end;
$$;

create or replace function public.sync_auth_user_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
	provider_name text := coalesce(
		new.raw_app_meta_data ->> 'provider',
		case when new.phone is not null then 'phone' else 'email' end
	);
	provider_names text[];
begin
	select coalesce(array_agg(value), array[provider_name])
	into provider_names
	from jsonb_array_elements_text(coalesce(new.raw_app_meta_data -> 'providers', '[]'::jsonb)) as providers(value);

	update public.profiles set
		email = new.email,
		phone = new.phone,
		full_name = coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', full_name),
		avatar_url = coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture', avatar_url),
		auth_provider = provider_name,
		auth_providers = provider_names,
		updated_at = now()
	where id = new.id;
	return new;
end;
$$;

drop trigger if exists on_auth_user_profile_updated on auth.users;
create trigger on_auth_user_profile_updated
	after update of email, phone, raw_user_meta_data, raw_app_meta_data on auth.users
	for each row execute procedure public.sync_auth_user_profile();

update public.profiles as profile set
	email = auth_user.email,
	phone = auth_user.phone,
	auth_provider = coalesce(
		auth_user.raw_app_meta_data ->> 'provider',
		case when auth_user.phone is not null then 'phone' else 'email' end
	),
	auth_providers = coalesce(
		array(select jsonb_array_elements_text(coalesce(auth_user.raw_app_meta_data -> 'providers', '[]'::jsonb))),
		'{}'::text[]
	),
	updated_at = now()
from auth.users as auth_user
where profile.id = auth_user.id;

revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.sync_auth_user_profile() from public, anon, authenticated;

comment on column public.profiles.auth_provider is 'Most recently used or primary Supabase Auth provider.';
comment on column public.profiles.auth_providers is 'Supabase-managed providers connected to this auth user. Never user-editable.';
