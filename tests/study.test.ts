import test from 'node:test';
import assert from 'node:assert/strict';
import { generateQuizSchema, materialSchema, subjectSchema, reviewQuestions, type StudyAttempt } from '../src/lib/study';
import { generateStudyQuiz, validateStudyQuiz } from '../src/lib/study-gemini';
import { POST } from '../src/app/api/study/generate/route';

const material='Plants use light energy to convert water and carbon dioxide into sugars and oxygen.';
const questions=Array.from({length:5},(_,i)=>({prompt:`Question ${i}`,options:['Light','Wind','Soil','Sound'],correctIndex:0,explanation:'The notes describe light energy.',reviewTopic:'Photosynthesis',evidence:'Plants use light energy'}));
test('Study validates quick capture and only permits 5 or 10 question generation',()=>{
  assert.equal(subjectSchema.safeParse({name:' '}).success,false);
  assert.equal(materialSchema.safeParse({subject_id:'11111111-1111-4111-8111-111111111111',topic:'Plants',content:'Too short'}).success,false);
  for (const count of [0,1,6,100]) assert.equal(generateQuizSchema.safeParse({materialId:'11111111-1111-4111-8111-111111111111',count}).success,false);
  assert.equal(generateQuizSchema.safeParse({materialId:'11111111-1111-4111-8111-111111111111',count:5}).success,true);
});
test('Study rejects malformed, duplicate, ungrounded and wrong-sized generated quizzes',()=>{
  assert.equal(validateStudyQuiz({questions},5,material).length,5);
  for (const invalid of [[],questions.slice(0,4),questions.map(q=>({...q,correctIndex:5})),questions.map(q=>({...q,options:['A','A','B','C']})),questions.map(q=>({...q,evidence:'Not in these notes'})),questions.map(q=>({...q,prompt:'Duplicate'}))]) {
    assert.throws(()=>validateStudyQuiz({questions:invalid},5,material));
  }
});
test('Review uses the latest attempt, includes unsure answers and clears recovered mistakes',()=>{
  const old={id:'old',quiz_id:'quiz',score:0,total:5,created_at:'2026-01-01',results:questions.map(q=>({...q,selected:null,correct:false}))} as StudyAttempt;
  const latest={...old,id:'latest',created_at:'2026-01-02',results:old.results.map((q,i)=>({...q,selected:i===0?null:0,correct:i!==0}))};
  assert.equal(reviewQuestions([old,latest]).length,1);
  assert.equal(reviewQuestions([latest,old])[0].question.selected,null);
  assert.equal(reviewQuestions([old,{...latest,results:latest.results.map(q=>({...q,correct:true}))}]).length,0);
});
test('Study Gemini makes one bounded JSON request, uses existing model and handles quotas without retries',async()=>{
  const fetchOriginal=globalThis.fetch, keyOriginal=process.env.GEMINI_API_KEY, modelOriginal=process.env.GEMINI_MODEL;
  process.env.GEMINI_API_KEY='study-test-secret';process.env.GEMINI_MODEL='gemini-3.5-flash-lite';
  let calls=0;
  try {
    globalThis.fetch=async(url,init)=>{
      calls++;assert.match(String(url),/gemini-3.5-flash-lite:generateContent$/);
      const body=JSON.parse(init!.body as string);assert.equal(body.generationConfig.responseMimeType,'application/json');assert.ok(init!.signal);
      assert.equal(JSON.parse(body.contents[0].parts[0].text).questionCount,5);
      return Response.json({candidates:[{finishReason:'STOP',content:{parts:[{thought:true,text:'internal'},{text:JSON.stringify({questions})}]}}]});
    };
    assert.equal((await generateStudyQuiz('Plants',material,5)).length,5);assert.equal(calls,1);
    globalThis.fetch=async()=>{calls++;return new Response('secret upstream details',{status:429});};
    await assert.rejects(generateStudyQuiz('Plants',material,5),error=>error instanceof Error && /usage limit/i.test(error.message) && !error.message.includes('secret'));
    assert.equal(calls,2);
    delete process.env.GEMINI_API_KEY;
    await assert.rejects(generateStudyQuiz('Plants',material,5),/GEMINI_API_KEY/);assert.equal(calls,2);
  } finally {
    globalThis.fetch=fetchOriginal;
    if(keyOriginal===undefined) delete process.env.GEMINI_API_KEY;else process.env.GEMINI_API_KEY=keyOriginal;
    if(modelOriginal===undefined) delete process.env.GEMINI_MODEL;else process.env.GEMINI_MODEL=modelOriginal;
  }
});
test('Study generation rejects anonymous requests before any database or Gemini call',async()=>{
  const original=globalThis.fetch;let calls=0;
  try { globalThis.fetch=async()=>{calls++;throw new Error('Should not call');};
    const response=await POST(new Request('http://localhost/api/study/generate',{method:'POST',body:'{}'}));
    assert.equal(response.status,401);assert.equal(calls,0);assert.equal(response.headers.get('cache-control'),'no-store');
  } finally {globalThis.fetch=original;}
});
