-- Additive and rerunnable. Does not modify profiles or applications.
begin;

create table if not exists public.board_projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 100),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);
create table if not exists public.board_cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid,
  title text not null check (char_length(btrim(title)) between 1 and 300),
  body text not null default '' check (char_length(body) <= 10000),
  type text not null default 'note' check (type in ('note','idea','task','reminder','problem','solution')),
  category text not null default '' check (char_length(category) <= 100),
  due_date date,
  status text not null default 'open' check (status in ('open','completed','resolved')),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((type = 'problem' and status in ('open','resolved')) or (type <> 'problem' and status in ('open','completed'))),
  unique (id, user_id, type),
  foreign key (project_id, user_id) references public.board_projects(id, user_id)
);
create table if not exists public.board_solutions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  problem_id uuid not null,
  problem_type text not null default 'problem' check (problem_type = 'problem'),
  title text not null check (char_length(btrim(title)) between 1 and 300),
  tried text not null default '' check (char_length(tried) <= 10000),
  result text not null default '' check (char_length(result) <= 10000),
  outcome text not null default 'not_tried' check (outcome in ('not_tried','worked','partly_worked','did_not_work')),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (problem_id, user_id, problem_type) references public.board_cards(id, user_id, type)
);

create index if not exists board_projects_owner_idx on public.board_projects(user_id, archived_at);
create index if not exists board_cards_owner_project_idx on public.board_cards(user_id, project_id, created_at desc);
create index if not exists board_cards_owner_filter_idx on public.board_cards(user_id, archived_at, type, status);
create index if not exists board_cards_owner_due_idx on public.board_cards(user_id, due_date) where due_date is not null;
create index if not exists board_solutions_problem_idx on public.board_solutions(user_id, problem_id, created_at);

create or replace function public.board_touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at = clock_timestamp(); return new; end;
$$;

do $$
declare table_name text;
begin
  foreach table_name in array array['board_projects','board_cards','board_solutions'] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('drop trigger if exists board_updated_at on public.%I', table_name);
    execute format('create trigger board_updated_at before update on public.%I for each row execute function public.board_touch_updated_at()', table_name);
    execute format('drop policy if exists board_select on public.%I', table_name);
    execute format('drop policy if exists board_insert on public.%I', table_name);
    execute format('drop policy if exists board_update on public.%I', table_name);
    execute format('create policy board_select on public.%I for select to authenticated using ((select auth.uid()) = user_id)', table_name);
    execute format('create policy board_insert on public.%I for insert to authenticated with check ((select auth.uid()) = user_id)', table_name);
    execute format('create policy board_update on public.%I for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', table_name);
    execute format('revoke all on public.%I from anon, authenticated', table_name);
    execute format('grant select, insert, update on public.%I to authenticated', table_name);
  end loop;
end $$;
commit;
