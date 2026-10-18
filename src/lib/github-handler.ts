import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { accessToken, authenticate, authorizationUrl, configuration, configured, connection, createFlow, dbError, exchangeToken, flowCookie, flowSchema, githubFetch, GithubError, installationUrl, installations, numericId, ownProject, permittedRepository, readCredentials, recentCommits, repositories, sameState, seal, stateHash, unseal } from './github-server';

const reply=(body:object,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'private, no-store','Vary':'Authorization, Cookie'}});
const pageSchema=z.coerce.number().int().min(1).max(100);
function cookieOptions() {return {httpOnly:true,secure:configuration().origin.startsWith('https:'),sameSite:'lax' as const,path:'/api/github/callback',maxAge:600};}
async function body(request:Request) {
  const text=await request.text();
  if (text.length>2000) throw new GithubError('Request is too large.',400,'invalid');
  try {return JSON.parse(text);} catch {throw new GithubError('Send valid settings.',400,'invalid');}
}
function parsed<T>(schema:z.ZodType<T>,value:unknown):T {
  const result=schema.safeParse(value);if (!result.success) throw new GithubError('Choose valid GitHub settings.',400,'invalid');return result.data;
}
async function callback(request:NextRequest) {
  let projectId:string|undefined;let result='failed';
  try {
    const value=request.cookies.get(flowCookie)?.value;
    if (!value) throw new GithubError('Start connecting GitHub from your project.',400);
    const flow=flowSchema.parse(unseal(value,'oauth'));
    if (flow.expires<Date.now() || !sameState(flow.state,request.nextUrl.searchParams.get('state')??'')) throw new GithubError('Invalid authorization state.',400);
    projectId=flow.projectId;
    const {client,userId}=await authenticate(`Bearer ${flow.accessToken}`);
    if (userId!==flow.userId) throw new GithubError('Sign in again.',401);
    await ownProject(client,userId,flow.projectId);
    const hash=stateHash(flow.state);
    const state=await client.from('github_oauth_states').select('state_hash').eq('user_id',userId).eq('state_hash',hash).gt('expires_at',new Date().toISOString()).is('claimed_at',null).maybeSingle();
    dbError(state.error);if (!state.data) throw new GithubError('Authorization expired or was used.',400);
    if (request.nextUrl.searchParams.has('error')) throw new GithubError('Authorization cancelled.',400);
    const code=request.nextUrl.searchParams.get('code');
    if (!code && flow.stage==='install' && request.nextUrl.searchParams.has('installation_id')) {
      // setup URL installation_id is untrusted. Never use it to grant access.
      flow.stage='authorize';
      const response=NextResponse.redirect(authorizationUrl(flow));
      response.cookies.set(flowCookie,seal(flow,'oauth'),cookieOptions());
      response.headers.set('Cache-Control','no-store');response.headers.set('Referrer-Policy','no-referrer');return response;
    }
    if (!code || code.length>1000) throw new GithubError('Missing code.',400);
    const claim=await client.from('github_oauth_states').update({claimed_at:new Date().toISOString()}).eq('user_id',userId).eq('state_hash',hash).is('claimed_at',null).gt('expires_at',new Date().toISOString()).select('user_id');
    dbError(claim.error);if (!claim.data?.length) throw new GithubError('Authorization was already used.',400);
    const token=await exchangeToken({code,code_verifier:flow.verifier,redirect_uri:configuration().origin+'/api/github/callback'});
    const identity=parsed(z.object({id:numericId,login:z.string().min(1).max(100)}),await (await githubFetch('/user',token.credentials.accessToken)).json());
    const saved=await client.rpc('github_finish_connection',{p_state_hash:hash,p_github_user_id:identity.id,p_login:identity.login,p_credentials:seal(token.credentials,`credentials:${userId}`),p_expires_at:token.expiresAt});dbError(saved.error);
    result='connected';
  } catch { /* Never echo OAuth codes, state, tokens, provider bodies or DB details. */ }
  const url=new URL(projectId?`/board/projects/${projectId}`:'/board',configuration().origin);
  url.searchParams.set('github',result);
  const response=NextResponse.redirect(url);
  response.cookies.set(flowCookie,'',{...cookieOptions(),maxAge:0});
  response.headers.set('Cache-Control','private, no-store');response.headers.set('Referrer-Policy','no-referrer');return response;
}

export async function handleGithub(request:NextRequest) {
  try {
    const action=request.nextUrl.pathname.split('/').pop();
    if (action==='callback' && request.method==='GET') {configuration();return await callback(request);}
    const {client,userId,accessToken:supabaseToken}=await authenticate(request.headers.get('authorization'));
    const projectId=request.nextUrl.searchParams.get('projectId')??'';
    await ownProject(client,userId,projectId);
    if (request.method!=='GET') {
      // Bearer auth is required; also reject requests from a different browser origin.
      const origin=request.headers.get('origin');
      if (origin && origin!==request.nextUrl.origin) throw new GithubError('Request origin does not match this website.',403,'forbidden');
    }
    if (action==='connection' && request.method==='GET') {
      if (!configured()) return reply({configured:false,connected:false});
      const row=await connection(client,userId);
      const link=await client.from('project_github_repositories').select('project_id').eq('project_id',projectId).eq('user_id',userId).maybeSingle();dbError(link.error);
      return reply({configured:true,connected:!!row,login:row?.login,linked:!!link.data});
    }
    if (action==='repository' && request.method==='DELETE') {
      const result=await client.from('project_github_repositories').delete().eq('project_id',projectId).eq('user_id',userId);dbError(result.error);return reply({removed:true});
    }
    // Local disconnection must work even when GitHub is down/configuration removed.
    if (action==='connection' && request.method==='DELETE') {
      const row=await connection(client,userId);
      const removed=await client.rpc('github_disconnect');dbError(removed.error);
      let revoked=!row;
      if (row && configured()) try {
        const credentials=readCredentials(row),{clientId,secret}=configuration();
        await githubFetch(`/applications/${encodeURIComponent(clientId)}/grant`,Buffer.from(`${clientId}:${secret}`).toString('base64'),'DELETE',{access_token:credentials.accessToken},true);revoked=true;
      } catch { /* Local credentials and all project links are already removed. */ }
      return reply({disconnected:true,notice:revoked?'GitHub disconnected. Project repository links were removed.':'GitHub disconnected locally. To also revoke authorization on GitHub, visit GitHub Settings → Applications → Authorized GitHub Apps.'});
    }
    const config=configuration();
    if (request.nextUrl.origin!==config.origin) throw new GithubError('Open the website at GITHUB_APP_ORIGIN before connecting GitHub.',400,'origin');
    if (action==='connect' && request.method==='POST') {
      const settings=parsed(z.object({install:z.boolean().default(false)}),await body(request));
      const flow=createFlow(userId,projectId,supabaseToken,settings.install),ciphertext=seal(flow,'oauth');
      if (ciphertext.length>3800) throw new GithubError('Your sign-in session is too large for the secure callback. Contact the app administrator.',400,'session');
      const saved=await client.from('github_oauth_states').upsert({user_id:userId,state_hash:stateHash(flow.state),expires_at:new Date(flow.expires).toISOString(),claimed_at:null});dbError(saved.error);
      const response=reply({url:settings.install?installationUrl(flow):authorizationUrl(flow)});
      response.cookies.set(flowCookie,ciphertext,cookieOptions());return response;
    }
    const row=await connection(client,userId);
    const token=await accessToken(client,userId,row);
    if (action==='installations' && request.method==='GET') return reply(await installations(token,parsed(pageSchema,request.nextUrl.searchParams.get('page')??1)));
    if (action==='repositories' && request.method==='GET') {
      const installationId=parsed(z.coerce.number().pipe(numericId),request.nextUrl.searchParams.get('installationId'));
      return reply(await repositories(token,installationId,parsed(pageSchema,request.nextUrl.searchParams.get('page')??1)));
    }
    if (action==='repository' && request.method==='PUT') {
      const input=parsed(z.object({installationId:numericId,repositoryId:numericId}),await body(request));
      await permittedRepository(token,input.installationId,input.repositoryId);
      const saved=await client.from('project_github_repositories').upsert({project_id:projectId,user_id:userId,github_user_id:row!.github_user_id,installation_id:input.installationId,repository_id:input.repositoryId,linked_at:new Date().toISOString()});dbError(saved.error);
      return reply({linked:true});
    }
    if (action==='activity' && request.method==='GET') {
      const link=await client.from('project_github_repositories').select('installation_id,repository_id').eq('project_id',projectId).eq('user_id',userId).maybeSingle();dbError(link.error);
      if (!link.data) return reply({repository:null,commits:[],checkedAt:new Date().toISOString()});
      const repo=await permittedRepository(token,link.data.installation_id,link.data.repository_id);
      return reply({repository:repo,commits:await recentCommits(token,repo),checkedAt:new Date().toISOString()});
    }
    return reply({error:'GitHub endpoint not found.'},404);
  } catch (error) {
    if (error instanceof GithubError) return reply({error:error.message,code:error.code},error.status);
    return reply({error:'Could not load GitHub activity. Try again later.',code:'github_error'},502);
  }
}
