import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { handleGithub } from '../src/lib/github-handler';
import { accessToken, authorizationUrl, createFlow, flowCookie, GithubError, permittedRepository, recentCommits, seal, stateHash, unseal, type Connection } from '../src/lib/github-server';

const user='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222',project='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const repository={id:101,name:'private-repo',full_name:'student/private-repo',private:true,default_branch:'develop'};
const credentials={accessToken:'private-github-access',refreshToken:'private-github-refresh',refreshExpires:Date.now()+86_400_000};
const installation={id:12,app_id:42,suspended_at:null,permissions:{contents:'read'},account:{login:'student'}};
const env={NEXT_PUBLIC_SUPABASE_URL:'https://github-test.supabase.co',NEXT_PUBLIC_SUPABASE_ANON_KEY:'test-public',GITHUB_APP_CLIENT_ID:'Iv1.test',GITHUB_APP_CLIENT_SECRET:'private-app-secret',GITHUB_APP_SLUG:'test-student-app',GITHUB_APP_ID:'42',GITHUB_APP_ORIGIN:'http://localhost:3000',GITHUB_CREDENTIALS_KEY:'12'.repeat(32)};
async function fixture(run:()=>Promise<void>) {
  const prior=Object.fromEntries(Object.keys(env).map(key=>[key,process.env[key]])),fetch=globalThis.fetch;
  Object.assign(process.env,env);
  try {await run();} finally {globalThis.fetch=fetch;for(const [key,value] of Object.entries(prior)){if(value===undefined)delete process.env[key];else process.env[key]=value;}}
}
function request(action:string,method='GET',body?:unknown,cookie?:string,query='') {
  return new NextRequest(`http://localhost:3000/api/github/${action}?projectId=${project}${query}`,{method,headers:{Authorization:'Bearer signed-in-test-user',...(body?{'Content-Type':'application/json'}:{}),...(cookie?{Cookie:`${flowCookie}=${cookie}`}:{})},body:body?JSON.stringify(body):undefined});
}
function row():Connection {return {user_id:user,github_user_id:3,login:'student',credentials:seal(credentials,`credentials:${user}`),expires_at:new Date(Date.now()+3600_000).toISOString(),version:project};}
type Dispatch=(url:string,init?:RequestInit)=>Response|Promise<Response>;
function mock(dispatch?:Dispatch) {
  const calls:string[]=[];
  globalThis.fetch=async(input,init)=>{
    const url=String(input);calls.push(url);
    if(url.includes('/auth/v1/user'))return Response.json({id:user});
    if(url.includes('/rest/v1/board_projects')){assert.match(url,/user_id=eq\.11111111/);return Response.json({id:project});}
    if(dispatch)return dispatch(url,init);
    throw new Error(`Unexpected request ${url}`);
  };return calls;
}
test('GitHub credentials use authenticated encryption bound to the user and purpose',()=>fixture(async()=>{
  const encrypted=seal(credentials,`credentials:${user}`);
  assert.ok(!encrypted.includes(credentials.accessToken));assert.deepEqual(unseal(encrypted,`credentials:${user}`),credentials);
  assert.throws(()=>unseal(encrypted,`credentials:${other}`),GithubError);assert.throws(()=>unseal(encrypted,'oauth'),GithubError);
  const tampered=Buffer.from(encrypted,'base64url');tampered[30]^=1;
  assert.throws(()=>unseal(tampered.toString('base64url'),`credentials:${user}`),GithubError);
}));
test('Every GitHub API action rejects anonymous and foreign projects before provider or credential reads',()=>fixture(async()=>{
  let calls=0;globalThis.fetch=async()=>{calls++;throw new Error('No external requests');};
  for(const action of ['connection','connect','installations','repositories','repository','activity']) {
    const response=await handleGithub(new NextRequest(`http://localhost:3000/api/github/${action}?projectId=${project}`));assert.equal(response.status,401);
  }assert.equal(calls,0);
  globalThis.fetch=async input=>String(input).includes('/auth/v1/user')?Response.json({id:user}):Response.json(null);
  assert.equal((await handleGithub(request('activity'))).status,404);
  assert.equal((await handleGithub(request('repository','PUT',{installationId:12,repositoryId:101}))).status,404);
}));
test('Connect stores only a state hash, sets an HttpOnly cookie and uses PKCE with a fixed callback',()=>fixture(async()=>{
  let stored:Record<string,unknown>|undefined;
  mock((url,init)=>{assert.match(url,/github_oauth_states/);stored=JSON.parse(String(init?.body));return new Response(null,{status:201});});
  const response=await handleGithub(request('connect','POST',{}));assert.equal(response.status,200);
  const cookie=response.cookies.get(flowCookie)?.value;assert.ok(cookie);
  assert.match(response.headers.get('set-cookie')!,/HttpOnly/);assert.match(response.headers.get('set-cookie')!,/SameSite=lax/);
  const flow=unseal(cookie!,'oauth') as ReturnType<typeof createFlow>,url=new URL((await response.json()).url);
  assert.equal(flow.userId,user);assert.equal(flow.projectId,project);assert.equal(stored?.state_hash,stateHash(flow.state));
  assert.equal(url.origin,'https://github.com');assert.equal(url.searchParams.get('state'),flow.state);assert.equal(url.searchParams.get('code_challenge_method'),'S256');
  assert.equal(url.searchParams.get('redirect_uri'),'http://localhost:3000/api/github/callback');assert.equal(url.searchParams.get('scope'),'offline_access');
  assert.ok(!url.toString().includes(flow.verifier));assert.ok(!url.toString().includes('signed-in-test-user'));
}));
test('Forged, missing, expired and replayed callbacks cannot exchange a GitHub code',()=>fixture(async()=>{
  const flow=createFlow(user,project,'supabase-user-token',false);let calls=0;
  globalThis.fetch=async()=>{calls++;throw new Error('No token exchange');};
  for (const cookie of [undefined,seal({...flow,expires:0},'oauth'),seal(flow,'oauth'),'forged']) {
    const req=new NextRequest('http://localhost:3000/api/github/callback?code=stolen&state=forged',{headers:cookie?{Cookie:`${flowCookie}=${cookie}`}:{}});
    const response=await handleGithub(req);assert.equal(response.status,307);assert.ok(!response.headers.get('location')!.includes('stolen'));
  }assert.equal(calls,0);
  mock(url=>{assert.match(url,/github_oauth_states/);return Response.json(null);});
  const req=new NextRequest(`http://localhost:3000/api/github/callback?code=stolen&state=${flow.state}`,{headers:{Cookie:`${flowCookie}=${seal(flow,'oauth')}`}});
  assert.match((await handleGithub(req)).headers.get('location')!,/github=failed/);
}));
test('Install setup redirects into authorization and never trusts a supplied installation ID',()=>fixture(async()=>{
  const flow=createFlow(user,project,'supabase-token',true);
  const calls=mock(url=>{assert.match(url,/github_oauth_states/);return Response.json({state_hash:stateHash(flow.state)});});
  const req=new NextRequest(`http://localhost:3000/api/github/callback?state=${flow.state}&installation_id=999999`,{headers:{Cookie:`${flowCookie}=${seal(flow,'oauth')}`}});
  const response=await handleGithub(req);assert.equal(new URL(response.headers.get('location')!).pathname,'/login/oauth/authorize');
  assert.equal((unseal(response.cookies.get(flowCookie)!.value,'oauth') as {stage:string}).stage,'authorize');
  assert.equal(calls.length,3);assert.ok(calls.every(url=>!url.includes('999999')));
}));
test('Successful callback verifies the app user and GitHub identity, consumes state, saves encrypted tokens and strips codes',()=>fixture(async()=>{
  const flow=createFlow(user,project,'supabase-token',false);let saved:Record<string,unknown>|undefined;
  mock((url,init)=>{
    if(url.includes('/github_oauth_states'))return init?.method==='PATCH'?Response.json([{user_id:user}]):Response.json({state_hash:stateHash(flow.state)});
    if(url==='https://github.com/login/oauth/access_token') {
      const body=new URLSearchParams(String(init?.body));assert.equal(body.get('code_verifier'),flow.verifier);assert.equal(body.get('client_secret'),env.GITHUB_APP_CLIENT_SECRET);
      return Response.json({access_token:'private-github-access',refresh_token:'private-github-refresh',expires_in:28800,refresh_token_expires_in:15897600});
    }
    if(url==='https://api.github.com/user')return Response.json({id:3,login:'student'});
    assert.match(url,/rpc\/github_finish_connection/);saved=JSON.parse(String(init?.body));return new Response(null,{status:204});
  });
  const response=await handleGithub(new NextRequest(`http://localhost:3000/api/github/callback?state=${flow.state}&code=one-use-code`,{headers:{Cookie:`${flowCookie}=${seal(flow,'oauth')}`}}));
  assert.equal(response.headers.get('location'),`http://localhost:3000/board/projects/${project}?github=connected`);assert.ok(saved);
  assert.equal(saved!.p_state_hash,stateHash(flow.state));assert.equal(saved!.p_github_user_id,3);
  assert.equal((unseal(String(saved!.p_credentials),`credentials:${user}`) as {accessToken:string}).accessToken,credentials.accessToken);
  assert.ok(!JSON.stringify(saved).includes(credentials.accessToken));assert.match(response.headers.get('set-cookie')!,/Max-Age=0/);
}));
test('Activity uses the selected private repository and explicit current default branch without database writes',()=>fixture(async()=>{
  const calls=mock((url,init)=>{
    assert.ok(!init?.method || init.method==='GET');
    if(url.includes('/github_connections'))return Response.json(row());
    if(url.includes('/project_github_repositories'))return Response.json({installation_id:12,repository_id:101});
    assert.equal(new Headers(init?.headers).get('Authorization'),`Bearer ${credentials.accessToken}`);assert.equal(init?.cache,'no-store');assert.equal(init?.redirect,'error');
    if(url.includes('/user/installations?'))return Response.json({total_count:1,installations:[installation]});
    if(url.includes('/user/installations/12/repositories'))return Response.json({total_count:1,repositories:[repository]});
    if(url.includes('/repositories/101'))return Response.json({...repository,default_branch:'new-default'});
    assert.match(url,/sha=new-default/);
    return Response.json([{sha:'a'.repeat(40),commit:{message:'Build project\nDetails',author:{name:'Student',date:'2026-10-18T10:00:00Z'}},author:{login:'student'}}]);
  });
  const response=await handleGithub(request('activity'));assert.equal(response.status,200);
  const value=await response.json();assert.equal(value.repository.private,true);assert.equal(value.repository.branch,'new-default');assert.equal(value.commits[0].author,'Student');
  assert.equal(value.commits[0].url,`https://github.com/student/private-repo/commit/${'a'.repeat(40)}`);assert.match(response.headers.get('cache-control')!,/no-store/);
  assert.ok(!JSON.stringify(value).includes(credentials.accessToken));assert.ok(calls.every(url=>!url.includes('board_cards')));
}));
test('Removed installations and unselected repositories deny activity, even if a repository is publicly readable',()=>fixture(async()=>{
  let installationsPresent=false;
  globalThis.fetch=async input=>{
    const url=String(input);
    if(url.includes('/user/installations?'))return Response.json({total_count:installationsPresent?1:0,installations:installationsPresent?[installation]:[]});
    if(url.includes('/user/installations/12/repositories'))return Response.json({total_count:0,repositories:[]});
    throw new Error('Must not read commits or public metadata');
  };
  await assert.rejects(permittedRepository('token',12,101),(error:unknown)=>error instanceof GithubError && error.code==='access_lost');
  installationsPresent=true;await assert.rejects(permittedRepository('token',12,101),GithubError);
}));
test('Repository pagination reaches later pages without silently dropping permitted repositories',()=>fixture(async()=>{
  globalThis.fetch=async input=>{
    const url=String(input);
    if(url.includes('/user/installations?'))return Response.json({total_count:1,installations:[installation]});
    if(new URL(url).searchParams.get('page')==='1')return Response.json({total_count:101,repositories:Array.from({length:100},(_,i)=>({...repository,id:i+1000}))});
    if(new URL(url).searchParams.get('page')==='2')return Response.json({total_count:101,repositories:[repository]});
    return Response.json(repository);
  };
  assert.equal((await permittedRepository('token',12,101)).id,101);
}));
test('Empty repositories, revoked access, rate limits and GitHub errors have safe distinct states',()=>fixture(async()=>{
  const repo={id:101,name:'private-repo',fullName:'student/private-repo',private:true,branch:'main',url:'https://github.com/student/private-repo'};
  globalThis.fetch=async()=>new Response('private provider content',{status:409});assert.deepEqual(await recentCommits('token',repo),[]);
  for(const [status,code] of [[401,'reconnect'],[403,'access_lost'],[404,'access_lost'],[429,'rate_limit'],[500,'github_error']] as const){
    globalThis.fetch=async()=>new Response('private provider content',{status});
    await assert.rejects(recentCommits('token',repo),(error:unknown)=>error instanceof GithubError && error.code===code && !error.message.includes('private provider'));
  }
}));
test('Expired user tokens rotate under a database lease with compare-and-swap and no token leaks',()=>fixture(async()=>{
  const expired={...row(),expires_at:'2020-01-01T00:00:00Z'};let updates=0;
  mock((url,init)=>{
    if(url.includes('/rpc/github_claim_refresh'))return Response.json(true);
    if(url.includes('github.com/login/oauth/access_token'))return Response.json({access_token:'new-access',refresh_token:'new-refresh',expires_in:28800,refresh_token_expires_in:15897600});
    assert.match(url,/version=eq\./);const value=JSON.parse(String(init?.body));
    if(value.credentials){assert.equal((unseal(value.credentials,`credentials:${user}`) as {accessToken:string}).accessToken,'new-access');updates++;return Response.json([{user_id:user}]);}
    return new Response(null,{status:204});
  });
  // The helper accepts the same user-authenticated Supabase client used in routes.
  const {authenticate}=await import('../src/lib/github-server');const {client}=await authenticate('Bearer supabase-user');
  assert.equal(await accessToken(client,user,expired),'new-access');assert.equal(updates,1);
  globalThis.fetch=async()=>Response.json(false);
  await assert.rejects(accessToken(client,user,expired),(error:unknown)=>error instanceof GithubError && error.code==='refreshing');
}));
test('Disconnect deletes local secrets first and warns when remote grant revocation fails',()=>fixture(async()=>{
  let deleted=false;
  mock((url,init)=>{
    if(url.includes('/github_connections'))return Response.json(row());
    if(url.includes('/rpc/github_disconnect')){deleted=true;return new Response(null,{status:204});}
    assert.equal(deleted,true);assert.match(url,/\/grant$/);assert.equal(init?.method,'DELETE');return new Response('failure',{status:500});
  });
  const response=await handleGithub(request('connection','DELETE'));assert.equal(response.status,200);
  const result=await response.json();assert.equal(result.disconnected,true);assert.match(result.notice,/revoke authorization/);assert.ok(!JSON.stringify(result).includes(credentials.accessToken));
}));
test('Cross-origin mutations are denied before creating an authorization flow',()=>fixture(async()=>{
  mock();const req=request('connect','POST',{});req.headers.set('origin','https://attacker.example');
  assert.equal((await handleGithub(req)).status,403);
  assert.equal(new URL(authorizationUrl(createFlow(user,project,'token',false))).origin,'https://github.com');
}));
test('Link/change validates selected repository before saving owner-bound IDs; unlink works without GitHub',()=>fixture(async()=>{
  let stored:Record<string,unknown>|undefined;
  mock((url,init)=>{
    if(url.includes('/github_connections'))return Response.json(row());
    if(url.includes('/user/installations?'))return Response.json({total_count:1,installations:[installation]});
    if(url.includes('/user/installations/12/repositories'))return Response.json({total_count:1,repositories:[repository]});
    if(url.includes('/repositories/101'))return Response.json(repository);
    if(url.includes('/project_github_repositories')){stored=JSON.parse(String(init?.body));return new Response(null,{status:201});}
    throw new Error('Unexpected request');
  });
  assert.equal((await handleGithub(request('repository','PUT',{installationId:12,repositoryId:101}))).status,200);
  assert.equal(stored?.project_id,project);assert.equal(stored?.user_id,user);assert.equal(stored?.github_user_id,3);assert.equal(stored?.repository_id,101);
  assert.ok(!JSON.stringify(stored).includes('private-repo'));
  mock((url,init)=>{assert.match(url,/project_github_repositories/);assert.equal(init?.method,'DELETE');assert.match(url,/user_id=eq\.11111111/);return new Response(null,{status:204});});
  assert.equal((await handleGithub(request('repository','DELETE'))).status,200);
}));
test('Connection responses expose metadata only and unavailable configuration fails gracefully',()=>fixture(async()=>{
  mock(url=>{
    if(url.includes('/github_connections'))return Response.json(row());
    if(url.includes('/project_github_repositories'))return Response.json({project_id:project});
    throw new Error('No provider request needed');
  });
  const response=await handleGithub(request('connection'));const value=await response.json();
  assert.deepEqual(value,{configured:true,connected:true,login:'student',linked:true});
  assert.ok(!JSON.stringify(value).includes('credentials'));
  delete process.env.GITHUB_APP_CLIENT_SECRET;mock();
  assert.deepEqual(await (await handleGithub(request('connection'))).json(),{configured:false,connected:false});
}));
