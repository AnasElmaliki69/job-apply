-- Additive and rerunnable. Run after the existing Board migrations.
-- Existing owner policies, card deletion grants and foreign keys remain in place.
begin;
alter table public.board_projects
  add column if not exists goal text not null default '',
  add column if not exists description text not null default '',
  add column if not exists repository_url text not null default '',
  add column if not exists source_links jsonb not null default '[]'::jsonb;
alter table public.board_cards
  add column if not exists format text not null default 'text',
  add column if not exists url text not null default '';

create or replace function public.board_valid_url(value text) returns boolean
language sql immutable set search_path='' as $$
  select value='' or (length(value)<=2000 and value ~* '^https?://[^[:space:]/?#@]+([/?#][^[:space:]]*)?$');
$$;
create or replace function public.board_valid_links(value jsonb) returns boolean
language plpgsql immutable set search_path='' as $$
declare item jsonb;
begin
  if jsonb_typeof(value) is distinct from 'array' then return false; end if;
  if jsonb_array_length(value)>20 then return false; end if;
  for item in select * from jsonb_array_elements(value) loop
    if jsonb_typeof(item)<>'string' or item#>>'{}'='' or not public.board_valid_url(item#>>'{}') then return false; end if;
  end loop;
  return true;
end $$;
do $$ begin
  if not exists(select 1 from pg_constraint where conname='board_project_details_valid' and conrelid='public.board_projects'::regclass) then
    alter table public.board_projects add constraint board_project_details_valid check (
      length(goal)<=5000 and length(description)<=10000 and public.board_valid_url(repository_url) and public.board_valid_links(source_links));
  end if;
  if not exists(select 1 from pg_constraint where conname='board_card_format_valid' and conrelid='public.board_cards'::regclass) then
    alter table public.board_cards add constraint board_card_format_valid check (format in ('text','link','code','decision') and public.board_valid_url(url));
  end if;
end $$;
create index if not exists board_cards_project_tasks_idx on public.board_cards(user_id,project_id,status) where type='task' and archived_at is null;
create index if not exists board_cards_project_format_idx on public.board_cards(user_id,project_id,format) where archived_at is null;
-- No new tables or service-role operations. Existing table RLS covers new columns.
commit;
