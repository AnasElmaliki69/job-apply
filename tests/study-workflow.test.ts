import test from 'node:test';
import assert from 'node:assert/strict';
import { POST } from '../src/app/api/study/generate/route';

const user='11111111-1111-4111-8111-111111111111', materialId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const material={subject_id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',topic:'Plants',content:'Plants use light energy to convert water and carbon dioxide into sugars and oxygen.'};
const questions=Array.from({length:5},(_,i)=>({prompt:`Question ${i}`,options:['Light','Wind','Soil','Sound'],correctIndex:0,explanation:'The material describes light energy.',reviewTopic:'Photosynthesis',evidence:'Plants use light energy'}));
async function fixture(run:()=>Promise<void>) {
  const names=['NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_ANON_KEY','GEMINI_API_KEY'] as const;
  const previous=names.map(name=>process.env[name]),original=globalThis.fetch;
  ['https://study-test.supabase.co','test-public','private-test-gemini-key'].forEach((value,i)=>{process.env[names[i]]=value;});
  try {await run();} finally {globalThis.fetch=original;names.forEach((name,i)=>{if(previous[i]===undefined)delete process.env[name];else process.env[name]=previous[i];});}
}
function request(body:unknown={materialId,count:5}) {return new Request('http://localhost/api/study/generate',{method:'POST',headers:{Authorization:'Bearer test-user','Content-Type':'application/json'},body:JSON.stringify(body)});}
test('Study generation verifies owner, reserves quota, validates Gemini output and saves without leaking answers',()=>fixture(async()=>{
  const calls:string[]=[];
  globalThis.fetch=async(input,init)=>{
    const url=String(input);calls.push(url);
    if(url.includes('/auth/v1/user'))return Response.json({id:user});
    if(url.includes('/rest/v1/study_materials')){assert.match(url,/user_id=eq\.11111111/);return Response.json(material);}
    if(url.includes('/rest/v1/study_quizzes'))return Response.json([]);
    if(url.includes('/rpc/study_reserve_generation'))return Response.json(true);
    if(url.includes('generativelanguage.googleapis.com'))return Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify({questions})}]}}]});
    if(url.includes('/rpc/study_create_quiz')){const body=JSON.parse(String(init?.body));assert.equal(body.p_material_id,materialId);assert.equal(body.p_difficulty,'medium');assert.deepEqual(body.p_questions,questions);return Response.json('saved-quiz-id');}
    throw new Error('Unexpected call');
  };
  const response=await POST(request());assert.equal(response.status,200);
  assert.deepEqual(await response.json(),{id:'saved-quiz-id'});
  assert.equal(calls.length,6);assert.match(calls[0],/auth\/v1\/user/);
  assert.equal(calls.filter(url=>url.includes('generativelanguage.googleapis.com')).length,1);
}));
test('Missing or foreign study material is rejected without calling Gemini',()=>fixture(async()=>{
  globalThis.fetch=async(input)=>{
    const url=String(input);
    if(url.includes('/auth/v1/user'))return Response.json({id:user});
    if(url.includes('/rest/v1/study_materials'))return Response.json(null);
    throw new Error('No quota or AI call allowed');
  };
  assert.equal((await POST(request())).status,404);
}));
test('Generating a quiz from newly added material sends only the new notes and preserves the selected source',()=>fixture(async()=>{
  const newId='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
  const content='Cells contain membranes that regulate which substances enter and leave the cell.';
  const updatedQuestions=questions.map(question=>({...question,evidence:'Cells contain membranes'}));
  let generated=0;
  globalThis.fetch=async(input,init)=>{
    const url=String(input);
    if(url.includes('/auth/v1/user'))return Response.json({id:user});
    if(url.includes('/rest/v1/study_materials')){assert.equal(new URL(url).searchParams.get('id'),`eq.${newId}`);return Response.json({...material,topic:'Cells',content});}
    if(url.includes('/rest/v1/study_quizzes'))return Response.json([]);
    if(url.includes('/rpc/study_reserve_generation'))return Response.json(true);
    if(url.includes('generativelanguage.googleapis.com')){
      generated++;const prompt=JSON.parse(JSON.parse(String(init?.body)).contents[0].parts[0].text);
      assert.equal(prompt.material,content);assert.equal(prompt.topic,'Cells');assert.equal(prompt.difficulty,'hard');assert.ok(!prompt.material.includes(material.content));
      return Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify({questions:updatedQuestions})}]}}]});
    }
    assert.match(url,/rpc\/study_create_quiz/);const saved=JSON.parse(String(init?.body));assert.equal(saved.p_material_id,newId);assert.equal(saved.p_difficulty,'hard');return Response.json('new-quiz');
  };
  const response=await POST(request({materialId:newId,count:5,difficulty:'hard'}));assert.equal(response.status,200);assert.equal(generated,1);
}));
test('Invalid quiz sizes and failed auth stop before loading material or calling AI',()=>fixture(async()=>{
  globalThis.fetch=async(input)=>{assert.match(String(input),/auth\/v1\/user/);return Response.json({id:user});};
  assert.equal((await POST(request({materialId,count:100}))).status,400);
  assert.equal((await POST(request({materialId,count:5,difficulty:'expert'}))).status,400);
  globalThis.fetch=async()=>Response.json({message:'Expired'},{status:401});
  assert.equal((await POST(request())).status,401);
}));
test('Study cooldown blocks generation and provider quota failures do not save a quiz',()=>fixture(async()=>{
  let allow=false,aiCalls=0;
  globalThis.fetch=async(input)=>{
    const url=String(input);
    if(url.includes('/auth/v1/user'))return Response.json({id:user});
    if(url.includes('/rest/v1/study_materials'))return Response.json(material);
    if(url.includes('/rest/v1/study_quizzes'))return Response.json([]);
    if(url.includes('/rpc/study_reserve_generation'))return Response.json(allow);
    if(url.includes('generativelanguage.googleapis.com')){aiCalls++;return new Response('private upstream details',{status:429});}
    throw new Error('No quiz should be saved');
  };
  assert.equal((await POST(request())).status,429);assert.equal(aiCalls,0);
  allow=true;const response=await POST(request());assert.equal(response.status,429);assert.equal(aiCalls,1);
  const text=await response.text();assert.match(text,/usage limit/);assert.ok(!text.includes('private'));
}));
test('Missing difficulty migration stops generation before reserving quota or calling Gemini',()=>fixture(async()=>{
  globalThis.fetch=async input=>{
    const url=String(input);
    if(url.includes('/auth/v1/user'))return Response.json({id:user});
    if(url.includes('/rest/v1/study_materials'))return Response.json(material);
    if(url.includes('/rest/v1/study_quizzes'))return Response.json({code:'42703',message:'Missing difficulty column'},{status:400});
    throw new Error('No quota reservation or Gemini request allowed');
  };
  const response=await POST(request({materialId,count:5,difficulty:'hard'}));assert.equal(response.status,503);
  assert.match((await response.json()).error,/202611030001_study_quiz_difficulty.sql/);
}));
