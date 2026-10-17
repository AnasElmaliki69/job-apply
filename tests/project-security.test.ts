import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

test('Project migration preserves all feature data and enforces ownership and safe new fields',async () => {
  const db=new PGlite(); const a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222';
  const pa='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',pb='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  try {
    await db.exec(`create role authenticated;create role anon;create schema auth;create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema auth,public to authenticated,anon;insert into auth.users values('${a}'),('${b}');`);
    const files=['../supabase/schema.sql','../supabase/migrations/20261013_personal_board.sql','../supabase/migrations/202610130001_board_card_delete.sql','../supabase/migrations/202610140001_explore_offers.sql','../supabase/migrations/202610140002_study_quizzes.sql'];
    for (const file of files) await db.exec(readFileSync(new URL(file,import.meta.url),'utf8'));
    await db.exec(`insert into profiles(user_id,cv_text) values('${a}','Original master');insert into applications(user_id,job_title,company,job_offer_text,ai_analysis) values('${a}','Original role','Company','Offer','{}');
      insert into study_subjects(user_id,name) values('${a}','Original subject');insert into board_projects(id,user_id,name) values('${pa}','${a}','Existing A'),('${pb}','${b}','Private B');
      insert into board_cards(user_id,project_id,title,type) values('${a}','${pa}','Existing task','task'),('${b}','${pb}','Private card','note');`);
    const sql=readFileSync(new URL('../supabase/migrations/202610170001_board_projects_workspace.sql',import.meta.url),'utf8');
    await db.exec(sql);await db.exec(sql);
    assert.equal((await db.query('select * from applications')).rows.length,1);assert.equal((await db.query('select * from study_subjects')).rows.length,1);
    assert.equal((await db.query<{cv_text:string}>('select cv_text from profiles')).rows[0].cv_text,'Original master');
    assert.equal((await db.query<{format:string}>('select format from board_cards limit 1')).rows[0].format,'text');
    await db.exec(`set role authenticated;select set_config('request.jwt.claim.sub','${a}',false);`);
    assert.equal((await db.query('select * from board_projects')).rows.length,1);
    await db.query('update board_projects set goal=$1,description=$2,repository_url=$3,source_links=$4::jsonb where id=$5',['Finish prototype','Notes','https://github.com/user/repo','["https://example.com/guide"]',pa]);
    assert.equal((await db.query(`update board_projects set goal='Spoof' where id='${pb}' returning id`)).rows.length,0);
    await assert.rejects(db.exec(`insert into board_projects(user_id,name,goal) values('${b}','Spoof','Private')`),/row-level security/i);
    await assert.rejects(db.exec(`update board_projects set repository_url='javascript:alert(1)' where id='${pa}'`),/check constraint/i);
    await assert.rejects(db.exec(`update board_projects set source_links='{"link":"https://example.com"}' where id='${pa}'`),/check constraint/i);
    await assert.rejects(db.exec(`update board_projects set source_links='["https://user:pass@example.com"]' where id='${pa}'`),/check constraint/i);
    for (const format of ['text','link','code','decision']) await db.query('insert into board_cards(user_id,project_id,title,format,url,body) values($1,$2,$3,$4,$5,$6)',[a,pa,format,format,format==='link'?'https://example.com':'',format==='decision'?'Because it is simpler':'content']);
    await assert.rejects(db.query('insert into board_cards(user_id,project_id,title) values($1,$2,$3)',[a,pb,'Cross-owner']),/foreign key/i);
    await assert.rejects(db.exec(`update board_cards set format='unknown' where user_id='${a}'`),/check constraint/i);
    await assert.rejects(db.exec(`update board_cards set url='data:text/html,test' where user_id='${a}'`),/check constraint/i);
    const old=(await db.query<{id:string;updated_at:string}>(`select id,updated_at::text from board_cards where title='Existing task'`)).rows[0];
    await db.query('update board_cards set status=$1 where id=$2',['completed',old.id]);
    assert.equal((await db.query('update board_cards set body=$1 where id=$2 and updated_at=$3 returning id',['Stale',old.id,old.updated_at])).rows.length,0);
    await db.query('update board_cards set project_id=null where id=$1',[old.id]);
    assert.equal((await db.query('delete from board_cards where id=$1 returning id',[old.id])).rows.length,1); // deletion grant preserved
    await db.exec('reset role;set role anon;');
    for (const table of ['board_projects','board_cards']) await assert.rejects(db.query(`select * from ${table}`),/permission denied/i);
  } finally {await db.close();}
});
