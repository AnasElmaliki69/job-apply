-- Additive and rerunnable. Run after the original supabase/schema.sql.
begin;
create table if not exists public.explore_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  keywords text not null default '' check (char_length(keywords) <= 200),
  location text not null default '' check (char_length(location) <= 200),
  remote text not null default 'any' check (remote in ('any','remote','onsite')),
  contract text not null default 'any' check (contract in ('any','permanent','contract','full_time','part_time','apprenticeship','internship')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.explore_offers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null default 'adzuna' check (provider = 'adzuna'),
  provider_offer_id text not null check (provider_offer_id ~ '^[A-Za-z0-9_-]{1,100}$'),
  state text not null check (state in ('saved','dismissed','visible')),
  listing jsonb not null check (jsonb_typeof(listing) = 'object'),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (user_id, provider, provider_offer_id), unique (id, user_id)
);
create index if not exists explore_offers_owner_state_idx on public.explore_offers(user_id, state, updated_at desc);
alter table public.applications add column if not exists source_offer_id uuid;
create unique index if not exists applications_source_offer_idx on public.applications(source_offer_id) where source_offer_id is not null;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'applications_source_offer_owner_fk' and conrelid = 'public.applications'::regclass) then
    alter table public.applications add constraint applications_source_offer_owner_fk
      foreign key (source_offer_id, user_id) references public.explore_offers(id, user_id);
  end if;
end $$;
create or replace function public.explore_touch_updated_at() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = clock_timestamp(); return new; end;
$$;
do $$ declare table_name text; begin
  foreach table_name in array array['explore_preferences','explore_offers'] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('drop trigger if exists explore_updated_at on public.%I', table_name);
    execute format('create trigger explore_updated_at before update on public.%I for each row execute function public.explore_touch_updated_at()', table_name);
    execute format('drop policy if exists explore_select on public.%I', table_name);
    execute format('drop policy if exists explore_insert on public.%I', table_name);
    execute format('drop policy if exists explore_update on public.%I', table_name);
    execute format('create policy explore_select on public.%I for select to authenticated using ((select auth.uid()) = user_id)', table_name);
    execute format('create policy explore_insert on public.%I for insert to authenticated with check ((select auth.uid()) = user_id)', table_name);
    execute format('create policy explore_update on public.%I for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', table_name);
    execute format('revoke all on public.%I from anon, authenticated', table_name);
    execute format('grant select, insert, update on public.%I to authenticated', table_name);
  end loop;
end $$;
commit;
