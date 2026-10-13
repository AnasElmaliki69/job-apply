import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

test('Board migration is additive, rerunnable and enforces ownership in PostgreSQL', async t => {
  const db = new PGlite();
  const a = '11111111-1111-4111-8111-111111111111', b = '22222222-2222-4222-8222-222222222222';
  const pa = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', pb = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const problem = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', note = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
  const otherProblem = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
  try {
    await db.exec(`create role authenticated; create role anon;
      create schema auth; create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      grant usage on schema public, auth to authenticated, anon;
      create table public.profiles(marker text); insert into public.profiles values ('existing CV');
      create table public.applications(marker text); insert into public.applications values ('existing application');
      insert into auth.users values ('${a}'),('${b}');`);
    const migration = readFileSync(new URL('../supabase/migrations/20261013_personal_board.sql', import.meta.url), 'utf8');
    await db.exec(migration); await db.exec(migration);
    assert.deepEqual((await db.query('select marker from profiles')).rows, [{ marker: 'existing CV' }]);
    assert.deepEqual((await db.query('select marker from applications')).rows, [{ marker: 'existing application' }]);
    await db.exec(`insert into board_projects(id,user_id,name) values ('${pa}','${a}','Studies'),('${pb}','${b}','Other user');
      insert into board_cards(id,user_id,project_id,title,type) values ('${problem}','${a}','${pa}','Study problem','problem'),('${note}','${a}',null,'A note','note');
      insert into board_cards(user_id,project_id,title) values ('${b}','${pb}','Private B');
      insert into board_cards(id,user_id,title,type) values ('${otherProblem}','${b}','Private problem','problem');
      insert into board_solutions(user_id,problem_id,title) values ('${a}','${problem}','Try a different approach');
      insert into board_solutions(user_id,problem_id,title) values ('${b}','${otherProblem}','Private solution');
      set role authenticated; select set_config('request.jwt.claim.sub','${a}',false);`);
    await t.test('each table only exposes the signed-in owner and blocks spoofing', async () => {
      for (const table of ['board_projects','board_cards','board_solutions']) {
        const { rows } = await db.query<{ user_id: string }>(`select user_id from ${table}`);
        assert.ok(rows.length); assert.ok(rows.every(row => row.user_id === a));
        assert.equal((await db.query(`update ${table} set user_id='${a}' where user_id='${b}' returning id`)).rows.length, 0);
      }
      await assert.rejects(db.exec(`insert into board_cards(user_id,title) values ('${b}','Spoof')`), /row-level security/i);
      await assert.rejects(db.exec(`insert into board_projects(user_id,name) values ('${b}','Spoof')`), /row-level security/i);
      await assert.rejects(db.exec(`insert into board_solutions(user_id,problem_id,title) values ('${b}','${problem}','Spoof')`), /row-level security/i);
      await assert.rejects(db.exec(`update board_cards set user_id='${b}' where id='${note}'`), /row-level security/i);
    });
    await t.test('relationships cannot cross users and solutions require a problem', async () => {
      await assert.rejects(db.exec(`update board_cards set project_id='${pb}' where id='${note}'`), /foreign key/i);
      await assert.rejects(db.exec(`insert into board_solutions(user_id,problem_id,title) values ('${a}','${note}','Wrong parent')`), /foreign key/i);
      await assert.rejects(db.exec(`insert into board_solutions(user_id,problem_id,title) values ('${a}','${otherProblem}','Other owner parent')`), /foreign key/i);
      await assert.rejects(db.exec(`update board_solutions set user_id='${b}'`), /row-level security/i);
      await assert.rejects(db.exec(`update board_cards set type='task' where id='${problem}'`), /foreign key/i);
    });
    await t.test('archive, move, resolve and outcomes preserve records; deletion is unavailable', async () => {
      await db.exec(`update board_projects set archived_at=now() where id='${pa}';
        update board_cards set status='resolved', archived_at=now(), project_id=null where id='${problem}';
        update board_solutions set tried='Reviewed the basics', result='Better understanding', outcome='partly_worked';`);
      assert.equal((await db.query(`select * from board_cards where id='${problem}'`)).rows.length, 1);
      assert.equal((await db.query(`select * from board_solutions where problem_id='${problem}'`)).rows.length, 1);
      await assert.rejects(db.exec(`update board_cards set status='completed' where id='${problem}'`), /check constraint/i);
      await assert.rejects(db.exec(`update board_solutions set outcome='invalid'`), /check constraint/i);
      for (const table of ['board_projects','board_cards','board_solutions']) await assert.rejects(db.exec(`delete from ${table}`), /permission denied/i);
      await db.exec(`update board_cards set archived_at=null,status='open',project_id='${pa}' where id='${problem}';`);
      assert.equal((await db.query<{ status: string }>(`select status from board_cards where id='${problem}'`)).rows[0].status, 'open');
    });
    await t.test('anonymous users cannot read, create or modify Board data', async () => {
      await db.exec('reset role; set role anon;');
      for (const table of ['board_projects','board_cards','board_solutions']) await assert.rejects(db.query(`select * from ${table}`), /permission denied/i);
    });
    await db.exec('reset role;');
    const deleteMigration = readFileSync(new URL('../supabase/migrations/202610130001_board_card_delete.sql', import.meta.url), 'utf8');
    await db.exec(deleteMigration); await db.exec(deleteMigration);
    await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${a}',false);`);
    await t.test('card deletion only affects the owner and rejects stale versions', async () => {
      assert.equal((await db.query(`delete from board_cards where id='${otherProblem}' returning id`)).rows.length, 0);
      const version = (await db.query<{ updated_at: string }>(`select updated_at::text from board_cards where id='${note}'`)).rows[0].updated_at;
      await db.exec(`update board_cards set title='A newer note' where id='${note}'`);
      assert.equal((await db.query(`delete from board_cards where id=$1 and updated_at=$2 returning id`, [note, version])).rows.length, 0);
      assert.equal((await db.query(`delete from board_cards where id='${note}' returning id`)).rows.length, 1);
      assert.equal((await db.query(`select id from board_cards where id='${note}'`)).rows.length, 0);
    });
    await t.test('deleting a problem atomically removes its solutions and keeps other users history', async () => {
      assert.equal((await db.query(`delete from board_cards where id='${problem}' returning id`)).rows.length, 1);
      assert.equal((await db.query(`select id from board_solutions where problem_id='${problem}'`)).rows.length, 0);
      for (const table of ['board_projects','board_solutions']) await assert.rejects(db.exec(`delete from ${table}`), /permission denied/i);
      await db.exec('reset role;');
      assert.equal((await db.query(`select id from board_cards where id='${otherProblem}'`)).rows.length, 1);
      assert.equal((await db.query(`select id from board_solutions where problem_id='${otherProblem}'`)).rows.length, 1);
      await db.exec('set role anon;');
      await assert.rejects(db.exec('delete from board_cards'), /permission denied/i);
    });
  } finally { await db.close(); }
});
