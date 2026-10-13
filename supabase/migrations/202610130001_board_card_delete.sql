-- Run after 20261013_personal_board.sql. Does not delete existing data.
begin;
alter table public.board_solutions
  drop constraint if exists board_solutions_problem_id_user_id_problem_type_fkey;
alter table public.board_solutions
  add constraint board_solutions_problem_id_user_id_problem_type_fkey
  foreign key (problem_id, user_id, problem_type)
  references public.board_cards(id, user_id, type) on delete cascade;

drop policy if exists board_delete on public.board_cards;
create policy board_delete on public.board_cards for delete to authenticated
using ((select auth.uid()) = user_id);
grant delete on public.board_cards to authenticated;
commit;
