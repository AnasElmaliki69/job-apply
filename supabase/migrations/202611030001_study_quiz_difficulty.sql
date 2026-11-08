-- Additive/rerunnable. Run after 202610140002_study_quizzes.sql.
-- Older quizzes retain unknown (NULL) difficulty; their questions/scores are unchanged.
begin;
alter table public.study_quizzes add column if not exists difficulty text
  check (difficulty in ('easy','medium','hard'));
grant select(difficulty) on public.study_quizzes to authenticated;

-- Keep the original two-argument function for older clients. Delegate validation
-- and ownership checks to it, and save the chosen level in the same transaction.
create or replace function public.study_create_quiz(p_material_id uuid,p_questions jsonb,p_difficulty text) returns uuid
language plpgsql security definer set search_path='' as $$
declare quiz_id uuid;
begin
  if p_difficulty is null or p_difficulty not in ('easy','medium','hard') then raise exception 'Invalid quiz difficulty'; end if;
  quiz_id:=public.study_create_quiz(p_material_id,p_questions);
  update public.study_quizzes set difficulty=p_difficulty where id=quiz_id and user_id=auth.uid();
  return quiz_id;
end $$;
revoke all on function public.study_create_quiz(uuid,jsonb,text) from public,anon;
grant execute on function public.study_create_quiz(uuid,jsonb,text) to authenticated;
commit;
