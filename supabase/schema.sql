begin;
create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  cv_text text not null check (char_length(btrim(cv_text)) between 1 and 30000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  job_title text not null check (char_length(btrim(job_title)) between 1 and 200),
  company text not null check (char_length(btrim(company)) between 1 and 200),
  job_offer_text text not null check (char_length(btrim(job_offer_text)) between 1 and 30000),
  ai_analysis jsonb not null check (jsonb_typeof(ai_analysis) = 'object'),
  status text not null default 'saved' check (status in ('saved','applied','interview','rejected','accepted')),
  notes text not null default '' check (char_length(notes) <= 10000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index applications_user_created_idx on public.applications (user_id, created_at desc);
create function public.set_updated_at() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end;
$$;
create trigger profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger applications_updated_at before update on public.applications for each row execute function public.set_updated_at();
alter table public.profiles enable row level security;
alter table public.applications enable row level security;
create policy profiles_own_rows on public.profiles for all to authenticated
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy applications_own_rows on public.applications for all to authenticated
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
revoke all on public.profiles, public.applications from anon;
grant select, insert, update, delete on public.profiles, public.applications to authenticated;
commit;
