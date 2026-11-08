import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PGlite} from '@electric-sql/pglite';
import {generateQuizSchema,type QuizDifficulty} from '../src/lib/study';
import {generateStudyQuiz} from '../src/lib/study-gemini';

const materialId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const material='Plants use light energy to convert water and carbon dioxide into sugars and oxygen.';
const questions=Array.from({length:5},(_,i)=>({prompt:`Question ${i}`,options:['Light','Wind','Soil','Sound'],correctIndex:0,explanation:'The notes describe light energy.',reviewTopic:'Photosynthesis',evidence:'Plants use light energy'}));

test('Quiz difficulty accepts exactly three levels, defaults to Medium and rejects unsupported client settings',()=>{
  assert.equal(generateQuizSchema.parse({materialId,count:5}).difficulty,'medium');
  for(const difficulty of ['easy','medium','hard'])assert.equal(generateQuizSchema.parse({materialId,count:10,difficulty}).difficulty,difficulty);
  for(const difficulty of ['expert','Hard','',null,1,{hard:true}])assert.equal(generateQuizSchema.safeParse({materialId,count:5,difficulty}).success,false);
});

test('Each difficulty reaches Gemini as trusted instructions, with Hard requiring note-grounded detail rather than outside facts',async()=>{
  const original=globalThis.fetch,priorKey=process.env.GEMINI_API_KEY;process.env.GEMINI_API_KEY='test-only';
  let level:QuizDifficulty='easy',calls=0;
  try {
    globalThis.fetch=async(_input,init)=>{
      calls++;const body=JSON.parse(String(init?.body)),source=JSON.parse(body.contents[0].parts[0].text);
      assert.equal(source.difficulty,level);assert.equal(source.material,material);assert.equal(source.questionCount,5);
      const instructions=body.systemInstruction.parts.map((part:{text:string})=>part.text).join(' ');
      assert.match(instructions,/using ONLY the supplied study material/);assert.match(instructions,/in English/);
      assert.match(instructions,/rather than inventing details/);
      if(level==='easy')assert.match(instructions,/direct recall for memorization/);
      if(level==='medium')assert.match(instructions,/compare concepts, explain cause and effect/);
      if(level==='hard'){
        assert.match(instructions,/precise mechanisms, qualifications, exceptions, conditions/);
        assert.match(instructions,/distractors closely matched/);assert.match(instructions,/ONLY where the notes actually provide those details/);
        assert.match(instructions,/Do not increase difficulty through obscure English, trick wording, ambiguous answers, or outside knowledge/);
      }
      return Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify({questions})}]}}]});
    };
    for(const value of ['easy','medium','hard'] as const){level=value;assert.equal((await generateStudyQuiz('Plants',material,5,level)).length,5);}
    assert.equal(calls,3); // one request per explicit generation, including Hard
  } finally {globalThis.fetch=original;if(priorKey===undefined)delete process.env.GEMINI_API_KEY;else process.env.GEMINI_API_KEY=priorKey;}
});

test('Difficulty migration preserves old quizzes, persists all levels and retains ownership and answer-key protection',async()=>{
  const db=new PGlite();const user='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222',subject='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  try {
    await db.exec(`create role authenticated;create role anon;create schema auth;create table auth.users(id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema public,auth to authenticated,anon;insert into auth.users values('${user}'),('${other}');`);
    await db.exec(readFileSync(new URL('../supabase/migrations/202610140002_study_quizzes.sql',import.meta.url),'utf8'));
    await db.exec(`set role authenticated;select set_config('request.jwt.claim.sub','${user}',false);insert into study_subjects(id,user_id,name) values('${subject}','${user}','Biology');`);
    await db.query('insert into study_materials(id,user_id,subject_id,topic,content) values($1,$2,$3,$4,$5)',[materialId,user,subject,'Plants',material]);
    const old=(await db.query<{id:string}>('select study_create_quiz($1,$2::jsonb) as id',[materialId,JSON.stringify(questions)])).rows[0].id;
    await db.query('select study_submit_attempt($1,gen_random_uuid(),$2::jsonb)',[old,'[0,0,0,0,0]']);
    await db.exec('reset role;');
    const sql=readFileSync(new URL('../supabase/migrations/202611030001_study_quiz_difficulty.sql',import.meta.url),'utf8');await db.exec(sql);await db.exec(sql);
    await db.exec(`set role authenticated;select set_config('request.jwt.claim.sub','${user}',false);`);
    assert.equal((await db.query<{difficulty:string|null}>('select difficulty from study_quizzes where id=$1',[old])).rows[0].difficulty,null);
    assert.equal((await db.query<{score:number}>('select score from study_attempts where quiz_id=$1',[old])).rows[0].score,5);
    for(const level of ['easy','medium','hard']) {
      const quiz=(await db.query<{id:string}>('select study_create_quiz($1,$2::jsonb,$3) as id',[materialId,JSON.stringify(questions),level])).rows[0].id;
      assert.equal((await db.query<{difficulty:string}>('select difficulty from study_quizzes where id=$1',[quiz])).rows[0].difficulty,level);
      const visible=(await db.query<{items:object[]}>('select study_quiz_questions($1) as items',[quiz])).rows[0].items;
      assert.deepEqual(Object.keys(visible[0]).sort(),['options','prompt']);
    }
    await assert.rejects(db.query('select study_create_quiz($1,$2::jsonb,$3)',[materialId,JSON.stringify(questions),'expert']),/Invalid quiz difficulty/i);
    await assert.rejects(db.query('select study_create_quiz($1,$2::jsonb,$3)',[materialId,JSON.stringify(questions),null]),/Invalid quiz difficulty/i);
    await assert.rejects(db.query('select questions from study_quizzes'),/permission denied/i);
    await assert.rejects(db.query("update study_quizzes set difficulty='easy' where id=$1",[old]),/permission denied/i);
    await db.exec(`select set_config('request.jwt.claim.sub','${other}',false);`);
    assert.equal((await db.query('select id,difficulty from study_quizzes')).rows.length,0);
    await assert.rejects(db.query('select study_create_quiz($1,$2::jsonb,$3)',[materialId,JSON.stringify(questions),'hard']),/not found/i);
    await db.exec('reset role;set role anon;');
    await assert.rejects(db.query('select study_create_quiz($1,$2::jsonb,$3)',[materialId,JSON.stringify(questions),'hard']),/permission denied/i);
  } finally {await db.close();}
});
