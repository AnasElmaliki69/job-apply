import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { selectStudySubject,studySubjectHref } from '../src/lib/study';

test('Study links reopen the same owned subject and focus new material, with safe fallback after deletion',()=>{
  const a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222';
  const subjects=[{id:a,name:'Biology'},{id:b,name:'History'}];
  assert.equal(studySubjectHref(b,true),`/study?subject=${b}#new-material`);
  assert.equal(studySubjectHref(b),`/study?subject=${b}`);
  assert.equal(studySubjectHref('https://attacker.example'),'/study');
  assert.equal(selectStudySubject(subjects,'',b),b);
  assert.equal(selectStudySubject(subjects,a,b),a); // manual selection survives reload
  assert.equal(selectStudySubject(subjects,'','not-owned'),a);
  assert.equal(selectStudySubject(subjects.slice(1),a,a),b);
  assert.equal(selectStudySubject([],a,a),'');
});

test('New study material after a completed quiz preserves previous learning; subject deletion is atomic and owner-only',async()=>{
  const db=new PGlite();const a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222';
  const subject='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',other='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',foreign='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const questions=Array.from({length:5},(_,i)=>({prompt:`Question ${i}`,options:['One','Two','Three','Four'],correctIndex:0,explanation:'One is correct.',reviewTopic:'Topic',evidence:'One'}));
  const as=async(id:string)=>db.exec(`reset role;set role authenticated;select set_config('request.jwt.claim.sub','${id}',false);`);
  const addMaterial=async(user:string,subjectId:string,topic:string)=>{
    return (await db.query<{id:string}>('insert into study_materials(user_id,subject_id,topic,content) values($1,$2,$3,$4) returning id',[user,subjectId,topic,`${topic}: One. `.repeat(15)])).rows[0].id;
  };
  const quizFor=async(material:string)=>(await db.query<{id:string}>('select study_create_quiz($1,$2::jsonb) as id',[material,JSON.stringify(questions)])).rows[0].id;
  try {
    await db.exec(`create role authenticated;create role anon;create schema auth;create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema auth,public to authenticated,anon;insert into auth.users values('${a}'),('${b}');`);
    for(const file of ['schema.sql','migrations/202610140002_study_quizzes.sql']) await db.exec(readFileSync(new URL(`../supabase/${file}`,import.meta.url),'utf8'));
    await db.exec(`insert into profiles(user_id,cv_text) values('${a}','Master CV');insert into applications(user_id,job_title,company,job_offer_text,ai_analysis) values('${a}','Role','Company','Offer','{}');`);
    await as(a);
    await db.query('insert into study_subjects(id,user_id,name) values($1,$2,$3),($4,$2,$5)',[subject,a,'Biology',other,'History']);
    const material1=await addMaterial(a,subject,'Cells'),quiz1=await quizFor(material1);
    await db.query('select study_submit_attempt($1,gen_random_uuid(),$2::jsonb)',[quiz1,'[0,0,0,0,0]']);
    // A second topic is added after scoring the first. It is a separate source.
    const material2=await addMaterial(a,subject,'Plants'),quiz2=await quizFor(material2);
    await db.query('select study_submit_attempt($1,gen_random_uuid(),$2::jsonb)',[quiz2,'[1,1,1,1,1]']);
    assert.equal((await db.query('select id from study_quizzes')).rows.length,2);
    assert.equal((await db.query<{score:number}>('select score from study_attempts where quiz_id=$1',[quiz1])).rows[0].score,5);
    assert.equal((await db.query<{topic:string}>('select topic from study_materials where id=$1',[material1])).rows[0].topic,'Cells');
    const kept=await addMaterial(a,other,'Dates'),keptQuiz=await quizFor(kept);
    await db.query('select study_submit_attempt($1,gen_random_uuid(),$2::jsonb)',[keptQuiz,'[0,0,0,0,0]']);
    await as(b);await db.query('insert into study_subjects(id,user_id,name) values($1,$2,$3)',[foreign,b,'Private B']);
    const bMaterial=await addMaterial(b,foreign,'Private topic'),bQuiz=await quizFor(bMaterial);
    await db.query('select study_submit_attempt($1,gen_random_uuid(),$2::jsonb)',[bQuiz,'[0,0,0,0,0]']);
    await db.exec('reset role;');
    const sql=readFileSync(new URL('../supabase/migrations/202611020001_study_subject_delete.sql',import.meta.url),'utf8');
    await db.exec(sql);await db.exec(sql); // migration itself deletes nothing
    assert.equal((await db.query('select * from study_materials')).rows.length,4);
    assert.equal((await db.query('select * from study_attempts')).rows.length,4);
    await as(b);await assert.rejects(db.query('select study_delete_subject($1)',[subject]),/not found/i);
    await as(a);await assert.rejects(db.query('delete from study_subjects where id=$1',[subject]),/permission denied/i);
    await assert.rejects(db.query('select questions from study_quizzes'),/permission denied/i); // no answer-key grants broadened
    assert.equal((await db.query<{ok:boolean}>('select study_delete_subject($1) as ok',[subject])).rows[0].ok,true);
    assert.equal((await db.query('select * from study_subjects')).rows.length,1);
    assert.equal((await db.query<{topic:string}>('select topic from study_materials')).rows[0].topic,'Dates');
    assert.equal((await db.query('select id from study_quizzes')).rows.length,1);
    assert.equal((await db.query('select * from study_attempts')).rows.length,1);
    assert.deepEqual((await db.query<{items:unknown[]}>('select study_review_questions() as items')).rows[0].items,[]);
    await assert.rejects(db.query('select study_delete_subject($1)',[subject]),/not found/i);
    await assert.rejects(db.query('select study_submit_attempt($1,gen_random_uuid(),$2::jsonb)',[quiz1,'[0,0,0,0,0]']),/not found/i);
    // Deleting the final subject leaves a clean empty Study, other accounts intact.
    await db.query('select study_delete_subject($1)',[other]);
    for(const table of ['study_subjects','study_materials','study_attempts'])assert.equal((await db.query(`select * from ${table}`)).rows.length,0);
    assert.equal((await db.query('select id from study_quizzes')).rows.length,0);
    for(const table of ['profiles','applications'])assert.equal((await db.query(`select * from ${table}`)).rows.length,1);
    await as(b);assert.equal((await db.query('select id from study_quizzes')).rows.length,1);assert.equal((await db.query('select * from study_attempts')).rows.length,1);
    await db.exec('reset role;set role anon;');await assert.rejects(db.query('select study_delete_subject($1)',[foreign]),/permission denied/i);
    await as('');await assert.rejects(db.query('select study_delete_subject($1)',[foreign]),/Sign in first/i);
  } finally {await db.close();}
});
