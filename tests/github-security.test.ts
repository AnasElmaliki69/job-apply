import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

test('GitHub migration preserves existing data, enforces ownership and cascades only repository links on disconnect',async()=>{
  const db=new PGlite();const a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222',pa='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',pb='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',cipher='encrypted-placeholder-not-a-token';
  const hash='a'.repeat(64);
  try {
    await db.exec(`create role authenticated;create role anon;create schema auth;create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema auth,public to authenticated,anon;insert into auth.users values('${a}'),('${b}');`);
    for(const file of ['schema.sql','migrations/20261013_personal_board.sql','migrations/202610130001_board_card_delete.sql','migrations/202610140001_explore_offers.sql','migrations/202610140002_study_quizzes.sql','migrations/202610170001_board_projects_workspace.sql']) await db.exec(readFileSync(new URL(`../supabase/${file}`,import.meta.url),'utf8'));
    await db.exec(`insert into board_projects(id,user_id,name) values('${pa}','${a}','Project A'),('${pb}','${b}','Project B'),('cccccccc-cccc-4ccc-8ccc-cccccccccccc','${b}','Unlinked B');
      insert into board_cards(user_id,project_id,title,type,status) values('${a}','${pa}','Task','task','completed');
      insert into profiles(user_id,cv_text) values('${a}','Original CV');
      insert into applications(user_id,job_title,company,job_offer_text,ai_analysis) values('${a}','Role','Company','Offer','{}');
      insert into study_subjects(user_id,name) values('${a}','Subject');`);
    const sql=readFileSync(new URL('../supabase/migrations/202610180001_project_github_activity.sql',import.meta.url),'utf8');
    await db.exec(sql);await db.exec(sql);
    await db.exec(`insert into github_connections(user_id,github_user_id,login,credentials,expires_at) values('${a}',1,'student-a','${cipher}',now()+interval '8 hours'),('${b}',2,'student-b','${cipher}',now()+interval '8 hours');
      insert into project_github_repositories(project_id,user_id,github_user_id,installation_id,repository_id) values('${pa}','${a}',1,12,101),('${pb}','${b}',2,13,102);
      insert into github_oauth_states(user_id,state_hash,expires_at) values('${a}','${hash}',now()+interval '10 minutes'),('${b}','${hash}',now()+interval '10 minutes');
      set role authenticated;select set_config('request.jwt.claim.sub','${a}',false);`);
    for(const table of ['github_connections','project_github_repositories','github_oauth_states']){
      const rows=(await db.query<{user_id:string}>(`select * from ${table}`)).rows;assert.equal(rows.length,1);assert.equal(rows[0].user_id,a);
      assert.equal((await db.query(`delete from ${table} where user_id=$1 returning *`,[b])).rows.length,0);
      assert.equal((await db.query(`update ${table} set user_id=user_id where user_id=$1 returning *`,[b])).rows.length,0);
    }
    await assert.rejects(db.query('insert into project_github_repositories(project_id,user_id,github_user_id,installation_id,repository_id) values($1,$2,1,12,101)',['cccccccc-cccc-4ccc-8ccc-cccccccccccc',a]),/foreign key/i);
    await assert.rejects(db.query('update github_connections set user_id=$1 where user_id=$2',[b,a]),/row-level security/i);
    await assert.rejects(db.query('insert into github_connections(user_id,github_user_id,login,credentials,expires_at) values($1,4,$2,$3,now())',[b,'spoof',cipher]),/row-level security/i);
    const version=(await db.query<{version:string}>('select version from github_connections')).rows[0].version;
    assert.equal((await db.query<{value:boolean}>('select github_claim_refresh($1) as value',[version])).rows[0].value,true);
    assert.equal((await db.query<{value:boolean}>('select github_claim_refresh($1) as value',[version])).rows[0].value,false);
    // Callback claims are single-use, and completion consumes the claimed state.
    const claim='update github_oauth_states set claimed_at=now() where user_id=$1 and claimed_at is null returning user_id';
    assert.equal((await db.query(claim,[a])).rows.length,1);assert.equal((await db.query(claim,[a])).rows.length,0);
    await db.query('select github_finish_connection($1,1,$2,$3,now()+interval \'8 hours\')',[hash,'student-renamed',cipher]);
    assert.equal((await db.query('select * from project_github_repositories')).rows.length,1); // same account retains link
    await assert.rejects(db.query('select github_finish_connection($1,3,$2,$3,now())',[hash,'replay',cipher]),/expired or was cancelled/i);
    await db.query('insert into github_oauth_states(user_id,state_hash,expires_at,claimed_at) values($1,$2,now()+interval \'10 minutes\',now())',[a,hash]);
    await db.query('select github_finish_connection($1,3,$2,$3,now()+interval \'8 hours\')',[hash,'other-github-account',cipher]);
    assert.equal((await db.query('select * from project_github_repositories')).rows.length,0); // account switch cannot retain old account links
    await db.query('insert into project_github_repositories(project_id,user_id,github_user_id,installation_id,repository_id) values($1,$2,3,12,101)',[pa,a]);
    await db.query('insert into github_oauth_states(user_id,state_hash,expires_at,claimed_at) values($1,$2,now()+interval \'10 minutes\',now())',[a,hash]);
    await db.query('select github_disconnect()');
    for(const table of ['github_connections','project_github_repositories','github_oauth_states'])assert.equal((await db.query(`select * from ${table}`)).rows.length,0);
    await assert.rejects(db.query('select github_finish_connection($1,1,$2,$3,now())',[hash,'cancelled-callback',cipher]),/expired or was cancelled/i);
    assert.equal((await db.query('select * from board_projects')).rows.length,1);assert.equal((await db.query<{status:string}>('select status from board_cards')).rows[0].status,'completed');
    for(const table of ['applications','profiles','study_subjects'])assert.equal((await db.query(`select * from ${table}`)).rows.length,1);
    await db.exec('reset role;');assert.equal((await db.query('select * from github_connections')).rows.length,1); // B unaffected
    await db.exec('set role anon;');
    for(const table of ['github_connections','project_github_repositories','github_oauth_states'])await assert.rejects(db.query(`select * from ${table}`),/permission denied/i);
    await assert.rejects(db.query('select github_disconnect()'),/permission denied/i);
  } finally {await db.close();}
});
