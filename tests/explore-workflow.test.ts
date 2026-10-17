import test from 'node:test';
import assert from 'node:assert/strict';
import { GET } from '../src/app/api/offers/route';
import { POST } from '../src/app/api/analyze/route';
const user='11111111-1111-4111-8111-111111111111', offer='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const analysis={matchScore:75,summary:'Profil adapté.',missingSkills:[],keywordsToAdd:[],improvedCvBullets:[],coverLetter:'Madame, Monsieur',interviewQuestions:[],suggestedSkills:[],tailoredCv:[{heading:'Profil',original:'CV',revised:'Expérience pertinente.',reason:'Profil adapté.'}]};
async function fixture(run:()=>Promise<void>) {
  const names=['NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_ANON_KEY','AI_PROVIDER','GEMINI_API_KEY','ADZUNA_APP_ID','ADZUNA_APP_KEY'] as const;
  const before=names.map(name=>process.env[name]), original=globalThis.fetch;
  const values=['https://test.supabase.co','test-public','gemini','fake-ai-secret','test-id','fake-job-secret'];
  names.forEach((name,index)=>{process.env[name]=values[index];});
  try { await run(); } finally { globalThis.fetch=original; names.forEach((name,index)=>{if(before[index]===undefined) delete process.env[name]; else process.env[name]=before[index];}); }
}
function request() { return new Request('http://localhost/api/analyze',{method:'POST',headers:{Authorization:'Bearer test-user','Content-Type':'application/json'},body:JSON.stringify({jobTitle:'Analyste',company:'Company',jobOfferText:'API excerpt',savedOfferId:offer})}); }
test('authenticated search verifies user before querying Adzuna and never returns its key',()=>fixture(async()=>{
  const calls:string[]=[];
  globalThis.fetch=async(input)=>{
    const url=String(input); calls.push(url);
    if(url.includes('/auth/v1/user')) return Response.json({id:user});
    if(url.startsWith('https://api.adzuna.com/')) return Response.json({count:1,results:[{id:'123',title:'Analyste',description:'Sécurité',redirect_url:'https://www.adzuna.fr/jobs/land/ad/123'}]});
    throw new Error('Unexpected request');
  };
  const response=await GET(new Request('http://localhost/api/offers?keywords=Security',{headers:{Authorization:'Bearer test-user'}}));
  assert.equal(response.status,200); assert.equal(calls.length,2); assert.match(calls[0],/auth\/v1\/user/);
  assert.equal(response.headers.get('cache-control'),'no-store'); assert.ok(!(await response.text()).includes('fake-job-secret'));
}));
test('analyzing an already prepared saved offer opens the existing application without AI',()=>fixture(async()=>{
  globalThis.fetch=async input=>{
    const url=String(input);
    if(url.includes('/auth/v1/user')) return Response.json({id:user});
    if(url.includes('/rest/v1/explore_offers')) {assert.match(url,/user_id=eq\.11111111/);return Response.json({id:offer,state:'saved'});}
    if(url.includes('/rest/v1/applications')) return Response.json({id:'existing-application'});
    throw new Error('AI and profile must not be called');
  };
  const response=await POST(request()); assert.equal(response.status,200); assert.equal((await response.json()).applicationId,'existing-application');
}));
test('another users saved offer is rejected before any AI call',()=>fixture(async()=>{
  globalThis.fetch=async input=>{
    const url=String(input);
    if(url.includes('/auth/v1/user')) return Response.json({id:user});
    if(url.includes('/rest/v1/explore_offers')) return Response.json(null);
    throw new Error('Must stop at owner boundary');
  };
  assert.equal((await POST(request())).status,404);
}));
test('saved offer analysis links the same workflow and a duplicate insert reuses the winning application',()=>fixture(async()=>{
  let inserts=0, existingChecks=0, aiCalls=0;
  globalThis.fetch=async(input,init)=>{
    const url=String(input);
    if(url.includes('/auth/v1/user')) return Response.json({id:user});
    if(url.includes('/rest/v1/explore_offers')) return Response.json({id:offer,state:'saved'});
    if(url.includes('/rest/v1/profiles')) return Response.json([{cv_text:'CV'}]);
    if(url.includes('generativelanguage.googleapis.com')) { aiCalls++; return Response.json({candidates:[{finishReason:'STOP',content:{parts:[{text:JSON.stringify(analysis)}]}}]}); }
    if(url.includes('/rest/v1/applications') && init?.method==='POST') {
      const value=JSON.parse(String(init.body)); assert.equal(value.source_offer_id,offer); assert.equal(value.user_id,user); assert.equal(value.ai_analysis.masterCvText,'CV'); inserts++;
      return Response.json({code:'23505',message:'Duplicate'},{status:409});
    }
    if(url.includes('/rest/v1/applications')) return Response.json(++existingChecks===1?null:{id:'winner'});
    throw new Error('Unexpected request');
  };
  const response=await POST(request()); assert.equal(response.status,200); assert.equal((await response.json()).applicationId,'winner'); assert.equal(inserts,1); assert.equal(aiCalls,1);
}));
