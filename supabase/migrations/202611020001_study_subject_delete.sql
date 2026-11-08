-- Additive/rerunnable. Run after 202610140002_study_quizzes.sql.
-- Deletion is explicit and atomic; no broad DELETE grants or cascade changes.
begin;
create or replace function public.study_delete_subject(p_subject_id uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare owner_id uuid := auth.uid();
begin
  if owner_id is null then raise exception 'Sign in first'; end if;
  perform 1 from public.study_subjects where id=p_subject_id and user_id=owner_id for update;
  if not found then raise exception 'Subject not found or already deleted'; end if;

  -- Lock parents before deleting descendants. New material/quizzes/attempts must
  -- finish their FK checks before deletion, or fail against the deleted parent.
  perform 1 from public.study_materials where subject_id=p_subject_id and user_id=owner_id order by id for update;
  perform 1 from public.study_quizzes q join public.study_materials m on m.id=q.material_id and m.user_id=q.user_id
    where m.subject_id=p_subject_id and q.user_id=owner_id order by q.id for update of q;
  delete from public.study_attempts a using public.study_quizzes q,public.study_materials m
    where a.quiz_id=q.id and q.material_id=m.id and m.subject_id=p_subject_id
      and a.user_id=owner_id and q.user_id=owner_id and m.user_id=owner_id;
  delete from public.study_quizzes q using public.study_materials m
    where q.material_id=m.id and m.subject_id=p_subject_id and q.user_id=owner_id and m.user_id=owner_id;
  delete from public.study_materials where subject_id=p_subject_id and user_id=owner_id;
  delete from public.study_subjects where id=p_subject_id and user_id=owner_id;
  return true;
end $$;
revoke all on function public.study_delete_subject(uuid) from public,anon;
grant execute on function public.study_delete_subject(uuid) to authenticated;
commit;
