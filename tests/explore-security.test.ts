import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

test('Explore migration preserves existing applications, deduplicates offers and enforces owner isolation', async () => {
  const db = new PGlite(); const a='11111111-1111-4111-8111-111111111111', b='22222222-2222-4222-8222-222222222222';
  const offerA='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', offerB='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  try {
    await db.exec(`create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema auth,public to authenticated,anon;
      insert into auth.users values ('${a}'),('${b}');`);
    await db.exec(readFileSync(new URL('../supabase/schema.sql',import.meta.url),'utf8'));
    await db.exec(`insert into profiles(user_id,cv_text) values ('${a}','Existing CV');
      insert into applications(user_id,job_title,company,job_offer_text,ai_analysis) values ('${a}','Existing role','Company','Text','{}');`);
    const migration=readFileSync(new URL('../supabase/migrations/202610140001_explore_offers.sql',import.meta.url),'utf8');
    await db.exec(migration); await db.exec(migration);
    assert.equal((await db.query('select * from applications')).rows.length,1);
    assert.equal((await db.query('select * from profiles')).rows.length,1);
    await db.exec(`insert into explore_offers(id,user_id,provider_offer_id,state,listing) values ('${offerA}','${a}','123','saved','{}'),('${offerB}','${b}','123','saved','{}');
      insert into explore_preferences(user_id,keywords) values ('${a}','Security'),('${b}','Private');
      set role authenticated; select set_config('request.jwt.claim.sub','${a}',false);`);
    for (const table of ['explore_offers','explore_preferences']) {
      const rows=await db.query<{user_id:string}>(`select user_id from ${table}`);
      assert.equal(rows.rows.length,1); assert.equal(rows.rows[0].user_id,a);
      assert.equal((await db.query(`update ${table} set user_id='${a}' where user_id='${b}' returning user_id`)).rows.length,0);
      await assert.rejects(db.exec(`delete from ${table}`),/permission denied/i);
    }
    await assert.rejects(db.exec(`insert into explore_preferences(user_id) values ('${b}')`),/row-level security/i);
    await assert.rejects(db.exec(`insert into explore_offers(user_id,provider_offer_id,state,listing) values ('${b}','spoof','saved','{}')`),/row-level security/i);
    await assert.rejects(db.exec(`update explore_offers set user_id='${b}' where id='${offerA}'`),/row-level security/i);
    // Upsert keeps the same saved offer UUID, even if Save is repeated.
    await db.exec(`insert into explore_offers(user_id,provider,provider_offer_id,state,listing) values ('${a}','adzuna','123','saved','{}') on conflict(user_id,provider,provider_offer_id) do update set state=excluded.state;`);
    assert.equal((await db.query<{id:string}>('select id from explore_offers')).rows[0].id,offerA);
    await db.exec(`update explore_offers set state='dismissed' where id='${offerA}';`);
    assert.equal((await db.query<{state:string}>('select state from explore_offers')).rows[0].state,'dismissed');
    await db.exec(`update explore_offers set state='saved' where id='${offerA}';`);
    await assert.rejects(db.exec(`insert into applications(user_id,job_title,company,job_offer_text,ai_analysis,source_offer_id) values ('${a}','Wrong','Company','Text','{}','${offerB}')`),/foreign key/i);
    await db.exec(`insert into applications(user_id,job_title,company,job_offer_text,ai_analysis,source_offer_id) values ('${a}','New','Company','Text','{}','${offerA}')`);
    await assert.rejects(db.exec(`insert into applications(user_id,job_title,company,job_offer_text,ai_analysis,source_offer_id) values ('${a}','Duplicate','Company','Text','{}','${offerA}')`),/unique constraint/i);
    await db.exec('reset role; set role anon;');
    for (const table of ['explore_offers','explore_preferences']) await assert.rejects(db.query(`select * from ${table}`),/permission denied/i);
  } finally { await db.close(); }
});
