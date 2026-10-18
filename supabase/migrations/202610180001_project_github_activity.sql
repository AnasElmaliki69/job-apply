-- Read-only GitHub activity. Additive/rerunnable; run after Board project workspace.
-- All credentials are AES-GCM ciphertext encrypted by the website server.
-- No plaintext GitHub token, repository name, or commit content is stored here.
begin;
create table if not exists public.github_connections (
  user_id uuid primary key references auth.users(id) on delete cascade,
  github_user_id bigint not null check (github_user_id > 0),
  login text not null check (length(login) between 1 and 100),
  credentials text not null check (length(credentials) between 30 and 16000),
  expires_at timestamptz not null,
  version uuid not null default gen_random_uuid(),
  refresh_lease_until timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, github_user_id)
);
create table if not exists public.project_github_repositories (
  project_id uuid primary key,
  user_id uuid not null,
  github_user_id bigint not null,
  installation_id bigint not null check (installation_id > 0),
  repository_id bigint not null check (repository_id > 0),
  linked_at timestamptz not null default now(),
  foreign key (project_id, user_id) references public.board_projects(id, user_id) on delete cascade,
  foreign key (user_id, github_user_id) references public.github_connections(user_id, github_user_id) on delete cascade
);
create index if not exists project_github_owner_idx on public.project_github_repositories(user_id);
create table if not exists public.github_oauth_states (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state_hash text not null check (length(state_hash) = 64),
  expires_at timestamptz not null,
  claimed_at timestamptz
);
do $$ declare name text; begin
  foreach name in array array['github_connections','project_github_repositories','github_oauth_states'] loop
    execute format('alter table public.%I enable row level security',name);
    execute format('drop policy if exists github_owner on public.%I',name);
    execute format('create policy github_owner on public.%I for all to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id)',name);
    execute format('revoke all on public.%I from public,anon,authenticated',name);
    execute format('grant select,insert,update,delete on public.%I to authenticated',name);
  end loop;
end $$;

-- One refresh at a time across tabs/server instances; short lease recovers crashes.
create or replace function public.github_claim_refresh(p_version uuid) returns boolean
language plpgsql security invoker set search_path='' as $$
begin
  update public.github_connections set refresh_lease_until=now()+interval '45 seconds'
  where user_id=(select auth.uid()) and version=p_version
    and (refresh_lease_until is null or refresh_lease_until<now());
  return found;
end $$;
-- Reconnecting the same account retains links; changing GitHub accounts clears them.
create or replace function public.github_finish_connection(p_state_hash text,p_github_user_id bigint,p_login text,p_credentials text,p_expires_at timestamptz) returns void
language plpgsql security invoker set search_path='' as $$
begin
  -- Serialize connection changes and disconnects for this user.
  perform pg_advisory_xact_lock(hashtextextended((select auth.uid())::text,180001));
  delete from public.github_oauth_states where user_id=(select auth.uid()) and state_hash=p_state_hash
    and expires_at>now() and claimed_at is not null;
  if not found then raise exception 'GitHub authorization expired or was cancelled'; end if;
  delete from public.github_connections where user_id=(select auth.uid()) and github_user_id<>p_github_user_id;
  insert into public.github_connections(user_id,github_user_id,login,credentials,expires_at)
    values((select auth.uid()),p_github_user_id,p_login,p_credentials,p_expires_at)
  on conflict(user_id) do update set github_user_id=excluded.github_user_id,login=excluded.login,
    credentials=excluded.credentials,expires_at=excluded.expires_at,version=gen_random_uuid(),refresh_lease_until=null;
end $$;
-- Atomically invalidate pending callbacks and remove links/credentials on disconnect.
create or replace function public.github_disconnect() returns void
language plpgsql security invoker set search_path='' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended((select auth.uid())::text,180001));
  delete from public.github_oauth_states where user_id=(select auth.uid());
  delete from public.github_connections where user_id=(select auth.uid());
end $$;
revoke all on function public.github_claim_refresh(uuid),public.github_finish_connection(text,bigint,text,text,timestamptz),public.github_disconnect() from public,anon;
grant execute on function public.github_claim_refresh(uuid),public.github_finish_connection(text,bigint,text,text,timestamptz),public.github_disconnect() to authenticated;
commit;
