// Node-only: never import into a client component. No service-role key is used.
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { GithubRepository, GithubCommit } from './github';

export class GithubError extends Error {
  constructor(message:string,public status=502,public code='github_error') { super(message); }
}
export const uuid = z.string().uuid();
export const numericId = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
export function configuration() {
  const { GITHUB_APP_CLIENT_ID:clientId,GITHUB_APP_CLIENT_SECRET:secret,GITHUB_APP_SLUG:slug,GITHUB_APP_ID:appId,GITHUB_APP_ORIGIN:origin,GITHUB_CREDENTIALS_KEY:key }=process.env;
  if (!clientId || !secret || !slug?.match(/^[a-z0-9-]+$/) || !appId?.match(/^[1-9]\d*$/) || !origin || !key?.match(/^[a-f0-9]{64}$/i)) throw new GithubError('GitHub is not configured yet. See docs/github-project-activity.md.',503,'not_configured');
  const url=new URL(origin);
  if (url.origin!==origin || !(url.protocol==='https:' || (url.protocol==='http:' && ['localhost','127.0.0.1'].includes(url.hostname)))) throw new GithubError('GITHUB_APP_ORIGIN must be the exact website origin (HTTPS, or localhost for development).',503,'not_configured');
  return {clientId,secret,slug,appId:Number(appId),origin,key};
}
export function configured() { try { configuration();return true; } catch {return false;} }
// Purpose + user AAD prevents ciphertext being moved between accounts or cookies.
export function seal(value:unknown,purpose:string) {
  const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',Buffer.from(configuration().key,'hex'),iv);
  cipher.setAAD(Buffer.from(purpose));
  const ciphertext=Buffer.concat([cipher.update(JSON.stringify(value),'utf8'),cipher.final()]);
  return Buffer.concat([iv,cipher.getAuthTag(),ciphertext]).toString('base64url');
}
export function unseal(value:string,purpose:string):unknown {
  try {
    const bytes=Buffer.from(value,'base64url');
    const decipher=createDecipheriv('aes-256-gcm',Buffer.from(configuration().key,'hex'),bytes.subarray(0,12));
    decipher.setAAD(Buffer.from(purpose));decipher.setAuthTag(bytes.subarray(12,28));
    return JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)),decipher.final()]).toString('utf8'));
  } catch { throw new GithubError('GitHub connection could not be read. Reconnect GitHub.',401,'reconnect'); }
}
export const stateHash=(state:string)=>createHash('sha256').update(state).digest('hex');
export function sameState(a:string,b:string) {
  const left=Buffer.from(a),right=Buffer.from(b);
  return left.length===right.length && timingSafeEqual(left,right);
}
export const flowSchema=z.object({userId:uuid,projectId:uuid,accessToken:z.string().min(1),state:z.string().length(43),verifier:z.string().length(43),expires:z.number(),stage:z.enum(['install','authorize'])});
export type GithubFlow=z.infer<typeof flowSchema>;
export const flowCookie='jobapply_github_oauth';
export function createFlow(userId:string,projectId:string,accessToken:string,install:boolean):GithubFlow {
  return {userId,projectId,accessToken,state:randomBytes(32).toString('base64url'),verifier:randomBytes(32).toString('base64url'),expires:Date.now()+600_000,stage:install?'install':'authorize'};
}
export function authorizationUrl(flow:GithubFlow) {
  const config=configuration(),url=new URL('https://github.com/login/oauth/authorize');
  url.search=new URLSearchParams({client_id:config.clientId,redirect_uri:config.origin+'/api/github/callback',state:flow.state,code_challenge:createHash('sha256').update(flow.verifier).digest('base64url'),code_challenge_method:'S256',scope:'offline_access',prompt:'select_account'}).toString();
  return url.toString();
}
export function installationUrl(flow:GithubFlow) {
  const url=new URL(`https://github.com/apps/${configuration().slug}/installations/new`);
  url.searchParams.set('state',flow.state);return url.toString();
}
export async function authenticate(authorization:string|null) {
  if (!authorization?.startsWith('Bearer ') || !authorization.slice(7)) throw new GithubError('Sign in to use project GitHub activity.',401,'sign_in');
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new GithubError('Supabase configuration is incomplete.',503,'configuration');
  const client=createClient(url,key,{global:{headers:{Authorization:authorization}},auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
  const {data,error}=await client.auth.getUser(authorization.slice(7));
  if (error || !data.user) throw new GithubError('Your session expired. Sign in again.',401,'sign_in');
  return {client,userId:data.user.id,accessToken:authorization.slice(7)};
}
export async function ownProject(client:SupabaseClient,userId:string,projectId:string) {
  if (!uuid.safeParse(projectId).success) throw new GithubError('Choose a valid project.',400,'invalid');
  const result=await client.from('board_projects').select('id').eq('id',projectId).eq('user_id',userId).maybeSingle();
  dbError(result.error);
  if (!result.data) throw new GithubError('Project not found.',404,'not_found');
}
export function dbError(error:unknown) { if (error) throw new GithubError('Could not save or load the GitHub connection. Check the GitHub SQL migration and try again.',500,'database'); }
export async function githubFetch(path:string,token:string,method='GET',body?:object,basic=false) {
  let response:Response;
  try {
    response=await fetch('https://api.github.com'+path,{method,headers:{Accept:'application/vnd.github+json',Authorization:`${basic?'Basic':'Bearer'} ${token}`,'X-GitHub-Api-Version':'2026-03-10','User-Agent':'JobApply-Project-Activity',...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,cache:'no-store',redirect:'error',signal:AbortSignal.timeout(15_000)});
  } catch {throw new GithubError('GitHub could not be reached. Try Refresh again.');}
  if (response.ok) return response;
  if (response.status===401) throw new GithubError('GitHub access expired or was revoked. Reconnect GitHub.',401,'reconnect');
  if (response.status===429 || (response.status===403 && (response.headers.get('x-ratelimit-remaining')==='0' || response.headers.has('retry-after')))) throw new GithubError('GitHub’s request limit was reached. Wait a little before refreshing.',429,'rate_limit');
  if ([403,404].includes(response.status)) throw new GithubError('Repository access is unavailable. Check the App installation, selected repositories, organization approval and SSO access on GitHub.',403,'access_lost');
  if (response.status===409) throw new GithubError('This repository has no commits yet.',409,'empty');
  throw new GithubError('GitHub returned an error. Try again later.');
}
const tokenSchema=z.object({access_token:z.string().min(1).max(4000),expires_in:z.number().int().positive().max(28800),refresh_token:z.string().min(1).max(4000),refresh_token_expires_in:z.number().int().positive().max(15897600)});
export type Credentials={accessToken:string;refreshToken:string;refreshExpires:number};
export async function exchangeToken(fields:Record<string,string>) {
  const {clientId,secret}=configuration();let response:Response;
  try { response=await fetch('https://github.com/login/oauth/access_token',{method:'POST',headers:{Accept:'application/json','Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:clientId,client_secret:secret,...fields}),cache:'no-store',redirect:'error',signal:AbortSignal.timeout(15_000)}); }
  catch {throw new GithubError('GitHub authorization could not be completed. Reconnect GitHub.',401,'reconnect');}
  const parsed=tokenSchema.safeParse(await response.json());
  if (!response.ok || !parsed.success) throw new GithubError('GitHub authorization expired or failed. Reconnect GitHub; enable expiring user tokens in the GitHub App settings.',401,'reconnect');
  const value=parsed.data;
  return {credentials:{accessToken:value.access_token,refreshToken:value.refresh_token,refreshExpires:Date.now()+value.refresh_token_expires_in*1000} satisfies Credentials,expiresAt:new Date(Date.now()+value.expires_in*1000).toISOString()};
}
export type Connection={user_id:string;github_user_id:number;login:string;credentials:string;expires_at:string;version:string};
export async function connection(client:SupabaseClient,userId:string):Promise<Connection|null> {
  const result=await client.from('github_connections').select('user_id,github_user_id,login,credentials,expires_at,version').eq('user_id',userId).maybeSingle();dbError(result.error);return result.data;
}
export function readCredentials(row:Connection) {
  const parsed=z.object({accessToken:z.string(),refreshToken:z.string(),refreshExpires:z.number()}).safeParse(unseal(row.credentials,`credentials:${row.user_id}`));
  if (!parsed.success) throw new GithubError('Reconnect GitHub to restore access.',401,'reconnect');return parsed.data;
}
export async function accessToken(client:SupabaseClient,userId:string,row:Connection|null) {
  if (!row) throw new GithubError('Connect GitHub to choose a repository.',401,'not_connected');
  const credentials=readCredentials(row);
  if (Date.parse(row.expires_at)>Date.now()+60_000) return credentials.accessToken;
  if (credentials.refreshExpires<=Date.now()) throw new GithubError('GitHub access expired. Reconnect GitHub.',401,'reconnect');
  const claim=await client.rpc('github_claim_refresh',{p_version:row.version});dbError(claim.error);
  if (!claim.data) throw new GithubError('GitHub access is being refreshed in another request. Try Refresh again in a moment.',409,'refreshing');
  try {
    const next=await exchangeToken({grant_type:'refresh_token',refresh_token:credentials.refreshToken});
    const result=await client.from('github_connections').update({credentials:seal(next.credentials,`credentials:${userId}`),expires_at:next.expiresAt,version:randomUUID(),refresh_lease_until:null}).eq('user_id',userId).eq('version',row.version).select('user_id');
    dbError(result.error);if (!result.data?.length) throw new GithubError('GitHub connection changed. Refresh the page.',409,'connection_changed');
    return next.credentials.accessToken;
  } finally {
    const result=await client.from('github_connections').update({refresh_lease_until:null}).eq('user_id',userId).eq('version',row.version);dbError(result.error);
  }
}
const repoSchema=z.object({id:numericId,name:z.string().min(1).max(100),full_name:z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/),private:z.boolean(),default_branch:z.string().max(255).nullable().optional()});
export function repository(value:unknown):GithubRepository {
  const parsed=repoSchema.safeParse(value);
  if (!parsed.success) throw new GithubError('GitHub returned an unreadable repository.');
  const repo=parsed.data;
  return {id:repo.id,name:repo.name,fullName:repo.full_name,private:repo.private,branch:repo.default_branch||'main',url:`https://github.com/${repo.full_name}`};
}
export async function installations(token:string,page:number) {
  const data=await (await githubFetch(`/user/installations?per_page=100&page=${page}`,token)).json();
  const parsed=z.object({total_count:z.number(),installations:z.array(z.object({id:numericId,app_id:numericId,suspended_at:z.string().nullable(),permissions:z.object({contents:z.string().optional()}),account:z.object({login:z.string()})}))}).safeParse(data);
  if (!parsed.success) throw new GithubError('GitHub returned unreadable installation data.');
  return {installations:parsed.data.installations.filter(item=>item.app_id===configuration().appId && !item.suspended_at && item.permissions.contents==='read').map(item=>({id:item.id,account:item.account.login})),hasMore:page*100<parsed.data.total_count};
}
export async function repositories(token:string,installationId:number,page:number) {
  const data=await (await githubFetch(`/user/installations/${installationId}/repositories?per_page=100&page=${page}`,token)).json();
  const parsed=z.object({total_count:z.number(),repositories:z.array(z.unknown())}).safeParse(data);
  if (!parsed.success) throw new GithubError('GitHub returned unreadable repository data.');
  return {repositories:parsed.data.repositories.map(repository),hasMore:page*100<parsed.data.total_count};
}
// Never trust an installation ID from a URL/DB, or public-repository API access.
// Verify both the installation and selected repository with this user's token.
export async function permittedRepository(token:string,installationId:number,repositoryId:number) {
  let valid=false;
  for (let page=1;page<=100;page++) {
    const data=await installations(token,page);valid=data.installations.some(item=>item.id===installationId);
    if (valid || !data.hasMore) break;
  }
  if (!valid) throw new GithubError('GitHub installation was removed, suspended, or is no longer accessible. Choose an available repository.',403,'access_lost');
  for (let page=1;page<=100;page++) {
    const data=await repositories(token,installationId,page),found=data.repositories.find(repo=>repo.id===repositoryId);
    if (found) {
      // Read current metadata so renames and default-branch changes are reflected.
      const current=repository(await (await githubFetch(`/repositories/${repositoryId}`,token)).json());
      if (current.id!==repositoryId) throw new GithubError('Repository identity changed.',403,'access_lost');return current;
    }
    if (!data.hasMore) break;
  }
  throw new GithubError('Repository is no longer selected or accessible. Choose a permitted repository again.',403,'access_lost');
}
export async function recentCommits(token:string,repo:GithubRepository):Promise<GithubCommit[]> {
  try {
    const data=await (await githubFetch(`/repos/${repo.fullName.split('/').map(encodeURIComponent).join('/')}/commits?${new URLSearchParams({sha:repo.branch,per_page:'20'})}`,token)).json();
    const parsed=z.array(z.object({sha:z.string().regex(/^[a-f0-9]{40,64}$/i),commit:z.object({message:z.string(),author:z.object({name:z.string().nullable(),date:z.string().nullable()}).nullable()}),author:z.object({login:z.string()}).nullable()})).safeParse(data);
    if (!parsed.success) throw new GithubError('GitHub returned unreadable commit data.');
    return parsed.data.map(item=>({sha:item.sha,message:item.commit.message.slice(0,4000),author:item.commit.author?.name||item.author?.login||'Unknown author',date:item.commit.author?.date && Number.isFinite(Date.parse(item.commit.author.date))?item.commit.author.date:null,url:`${repo.url}/commit/${item.sha}`}));
  } catch (error) {if (error instanceof GithubError && error.code==='empty') return [];throw error;}
}
