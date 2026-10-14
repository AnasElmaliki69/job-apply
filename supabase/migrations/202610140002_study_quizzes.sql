-- Additive, rerunnable. Apply to the existing database in Supabase SQL Editor.
begin;
create table if not exists public.study_subjects (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 100), created_at timestamptz not null default now(), unique(id,user_id)
);
create table if not exists public.study_materials (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  subject_id uuid not null, topic text not null check (length(trim(topic)) between 1 and 200),
  content text not null check (length(trim(content)) between 50 and 20000), created_at timestamptz not null default now(),
  unique(id,user_id), foreign key(subject_id,user_id) references public.study_subjects(id,user_id)
);
create table if not exists public.study_quizzes (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  material_id uuid not null, title text not null, question_count integer not null check (question_count in (5,10)),
  questions jsonb not null check (jsonb_typeof(questions)='array' and jsonb_array_length(questions)=question_count),
  created_at timestamptz not null default now(), unique(id,user_id),
  foreign key(material_id,user_id) references public.study_materials(id,user_id)
);
create table if not exists public.study_attempts (
  id uuid primary key, user_id uuid not null references auth.users(id) on delete cascade, quiz_id uuid not null,
  score integer not null, total integer not null check(total in (5,10)), results jsonb not null,
  created_at timestamptz not null default clock_timestamp(), check(score between 0 and total),
  foreign key(quiz_id,user_id) references public.study_quizzes(id,user_id)
);
create table if not exists public.study_generation_limits (
  user_id uuid primary key references auth.users(id) on delete cascade, last_requested_at timestamptz not null
);
create index if not exists study_subjects_owner_idx on public.study_subjects(user_id,created_at desc);
create index if not exists study_materials_subject_idx on public.study_materials(user_id,subject_id,created_at desc);
create index if not exists study_quizzes_material_idx on public.study_quizzes(user_id,material_id,created_at desc);
create index if not exists study_attempts_quiz_idx on public.study_attempts(user_id,quiz_id,created_at desc);

do $$ declare t text; begin
  foreach t in array array['study_subjects','study_materials','study_quizzes','study_attempts','study_generation_limits'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from public,anon,authenticated',t);
    execute format('drop policy if exists study_owner_select on public.%I',t);
    execute format('create policy study_owner_select on public.%I for select to authenticated using ((select auth.uid())=user_id)',t);
  end loop;
  foreach t in array array['study_subjects','study_materials'] loop
    execute format('drop policy if exists study_owner_insert on public.%I',t);
    execute format('create policy study_owner_insert on public.%I for insert to authenticated with check ((select auth.uid())=user_id)',t);
    execute format('grant select,insert on public.%I to authenticated',t);
  end loop;
end $$;
-- Answer keys are never directly readable, even by the quiz owner. Only metadata is granted.
grant select(id,user_id,material_id,title,question_count,created_at) on public.study_quizzes to authenticated;
grant select on public.study_attempts to authenticated;

create or replace function public.study_reserve_generation() returns boolean
language plpgsql security definer set search_path='' as $$
declare reserved uuid;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  insert into public.study_generation_limits(user_id,last_requested_at) values(auth.uid(),clock_timestamp())
  on conflict(user_id) do update set last_requested_at=excluded.last_requested_at
    where public.study_generation_limits.last_requested_at < clock_timestamp()-interval '30 seconds'
  returning user_id into reserved;
  return reserved is not null;
end $$;

create or replace function public.study_create_quiz(p_material_id uuid,p_questions jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare material public.study_materials; q jsonb; result uuid;
begin
  select * into material from public.study_materials where id=p_material_id and user_id=auth.uid();
  if not found then raise exception 'Study material not found'; end if;
  if jsonb_typeof(p_questions) is distinct from 'array' or jsonb_array_length(p_questions) not in (5,10) then raise exception 'Invalid quiz'; end if;
  for q in select value from jsonb_array_elements(p_questions) loop
    if jsonb_typeof(q->'options') is distinct from 'array' or jsonb_array_length(q->'options')<>4
      or jsonb_typeof(q->'correctIndex') is distinct from 'number' or not (q->>'correctIndex' ~ '^[0-3]$') or q->>'correctIndex' is null
      or coalesce(length(q->>'prompt'),0) not between 1 and 1000
      or coalesce(length(q->>'explanation'),0) not between 1 and 1500
      or coalesce(length(q->>'reviewTopic'),0) not between 1 and 200
      or coalesce(length(q->>'evidence'),0) not between 1 and 1200
      then raise exception 'Invalid question'; end if;
    if exists(select 1 from jsonb_array_elements(q->'options') o where jsonb_typeof(o)<>'string' or length(o#>>'{}') not between 1 and 500)
      then raise exception 'Invalid options'; end if;
  end loop;
  insert into public.study_quizzes(user_id,material_id,title,question_count,questions)
    values(auth.uid(),material.id,material.topic,jsonb_array_length(p_questions),p_questions) returning id into result;
  return result;
end $$;

create or replace function public.study_quiz_questions(p_quiz_id uuid) returns jsonb
language sql stable security definer set search_path='' as $$
  select jsonb_agg(jsonb_build_object('prompt',q.value->'prompt','options',q.value->'options') order by q.ordinality)
  from public.study_quizzes quiz cross join lateral jsonb_array_elements(quiz.questions) with ordinality q
  where quiz.id=p_quiz_id and quiz.user_id=auth.uid();
$$;

create or replace function public.study_submit_attempt(p_quiz_id uuid,p_attempt_id uuid,p_answers jsonb) returns public.study_attempts
language plpgsql security definer set search_path='' as $$
declare quiz public.study_quizzes; attempt public.study_attempts; results jsonb; score integer;
begin
  select * into quiz from public.study_quizzes where id=p_quiz_id and user_id=auth.uid();
  if not found then raise exception 'Quiz not found'; end if;
  -- A repeated HTTP request returns the same immutable attempt, never creates another.
  select * into attempt from public.study_attempts where id=p_attempt_id and user_id=auth.uid() and quiz_id=p_quiz_id;
  if found then return attempt; end if;
  if jsonb_typeof(p_answers) is distinct from 'array' or jsonb_array_length(p_answers)<>quiz.question_count
    then raise exception 'Answer every question or choose I am not sure'; end if;
  if exists(select 1 from jsonb_array_elements(p_answers) a where a<>'null'::jsonb and (jsonb_typeof(a)<>'number' or a::text !~ '^[0-3]$'))
    then raise exception 'Invalid answer'; end if;
  select jsonb_agg(q.value || jsonb_build_object('selected',p_answers->(q.ordinality::int-1),
    'correct',coalesce((p_answers->(q.ordinality::int-1))=(q.value->'correctIndex'),false)) order by q.ordinality),
    count(*) filter(where (p_answers->(q.ordinality::int-1))=(q.value->'correctIndex'))::int
  into results,score from jsonb_array_elements(quiz.questions) with ordinality q;
  insert into public.study_attempts(id,user_id,quiz_id,score,total,results)
    values(p_attempt_id,auth.uid(),p_quiz_id,score,quiz.question_count,results)
    on conflict(id) do nothing;
  select * into attempt from public.study_attempts where id=p_attempt_id and user_id=auth.uid() and quiz_id=p_quiz_id;
  if not found then raise exception 'Attempt ID already in use'; end if;
  return attempt;
end $$;

-- Latest attempt per quiz: successful retries remove earlier mistakes from Review again.
create or replace function public.study_review_questions() returns jsonb
language sql stable security definer set search_path='' as $$
  with latest as (select distinct on (quiz_id) * from public.study_attempts where user_id=auth.uid() order by quiz_id,created_at desc,id desc)
  select coalesce(jsonb_agg(jsonb_build_object('quizId',a.quiz_id,'title',quiz.title,'index',q.ordinality-1,'question',q.value) order by a.created_at desc,q.ordinality),'[]'::jsonb)
  from latest a join public.study_quizzes quiz on quiz.id=a.quiz_id
  cross join lateral jsonb_array_elements(a.results) with ordinality q
  where (q.value->>'correct')::boolean=false;
$$;
revoke all on function public.study_reserve_generation(),public.study_create_quiz(uuid,jsonb),public.study_quiz_questions(uuid),public.study_submit_attempt(uuid,uuid,jsonb),public.study_review_questions() from public,anon;
grant execute on function public.study_reserve_generation(),public.study_create_quiz(uuid,jsonb),public.study_quiz_questions(uuid),public.study_submit_attempt(uuid,uuid,jsonb),public.study_review_questions() to authenticated;
commit;
