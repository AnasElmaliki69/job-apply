'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ExternalLink, GitBranch, Github, RefreshCw } from 'lucide-react';
import { useSession } from './session';
import { Feedback, Loading } from './ui';
import type { GithubActivity, GithubConnection, GithubInstallation, GithubRepository } from '@/lib/github';

class RequestError extends Error { constructor(message:string,public code:string) {super(message);} }
export function ProjectGithub({ projectId }: {projectId:string}) {
  const {session}=useSession();
  if (!session) return null;
  // No account/project data survives an account or project change.
  return <Activity key={`${session.user.id}:${projectId}:${session.expires_at}`} projectId={projectId} token={session.access_token}/>;
}
function Activity({projectId,token}:{projectId:string;token:string}) {
  const [connection,setConnection]=useState<GithubConnection|null>(null),[activity,setActivity]=useState<GithubActivity|null>(null);
  const [busy,setBusy]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState(''),[reconnect,setReconnect]=useState(false);
  const [choosing,setChoosing]=useState(false),[accounts,setAccounts]=useState<GithubInstallation[]>([]),[installPage,setInstallPage]=useState(1),[moreAccounts,setMoreAccounts]=useState(false);
  const [installationId,setInstallationId]=useState(''),[repos,setRepos]=useState<GithubRepository[]>([]),[repoPage,setRepoPage]=useState(1),[moreRepos,setMoreRepos]=useState(false),[repositoryId,setRepositoryId]=useState('');
  const active=useRef(true),locked=useRef(false),epoch=useRef(0),focus=useRef<HTMLButtonElement>(null);
  const api=useCallback(async <T,>(action:string,method='GET',body?:object,params:Record<string,string>={}):Promise<T>=>{
    let response:Response;
    try {response=await fetch(`/api/github/${action}?${new URLSearchParams({projectId,...params})}`,{method,headers:{Authorization:`Bearer ${token}`,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,cache:'no-store',signal:AbortSignal.timeout(60_000)});}
    catch {throw new RequestError('Could not reach the website. Check your connection and try again.','network');}
    const value=await response.json();
    if (!response.ok) throw new RequestError(value.error||'Could not load GitHub activity.',value.code||'github_error');
    return value;
  },[projectId,token]);
  const run=useCallback(async (label:string,work:()=>Promise<void>)=>{
    if (locked.current) return;
    locked.current=true;setBusy(label);setError('');setNotice('');const current=++epoch.current;
    try {await work();}
    catch (err) {if (active.current && current===epoch.current) {
      setError(err instanceof Error?err.message:'GitHub could not be loaded.');
      // Immediately remove private content/options on any access or network failure.
      setActivity(null);setRepos([]);setAccounts([]);setRepositoryId('');
      if (err instanceof RequestError && ['reconnect','not_connected','sign_in'].includes(err.code)) setReconnect(true);
    }} finally {if (active.current && current===epoch.current) {locked.current=false;setBusy('');}}
  },[]);
  const load=useCallback(async()=>{
    const state=await api<GithubConnection>('connection');if (!active.current) return;
    setConnection(state);setReconnect(false);setActivity(null);
    if (state.connected && state.linked) {
      const value=await api<GithubActivity>('activity');if (active.current) setActivity(value);
    }
  },[api]);
  useEffect(()=>{
    active.current=true;void run('Loading GitHub…',load);
    const url=new URL(window.location.href),result=url.searchParams.get('github');
    if (result) {
      url.searchParams.delete('github');window.history.replaceState(null,'',url.pathname+url.search+url.hash);
      if (result==='connected') setNotice('GitHub connected. Choose a repository to show its commits. Switching GitHub accounts removes previous repository links.');
      else setError('GitHub connection was cancelled or expired. Try Connect GitHub again.');
    }
    return ()=>{active.current=false;locked.current=false;epoch.current++;};
  },[load,run]);
  async function connect(install=false) {
    await run('Opening GitHub…',async()=>{
      const value=await api<{url:string}>('connect','POST',{install});
      if (active.current) window.location.assign(value.url);
    });
  }
  async function loadRepos(id:string,page=1,append=false) {
    const value=await api<{repositories:GithubRepository[];hasMore:boolean}>('repositories','GET',undefined,{installationId:id,page:String(page)});
    if (!active.current) return;
    setRepos(previous=>append?[...previous,...value.repositories]:value.repositories);setRepoPage(page);setMoreRepos(value.hasMore);
  }
  async function choose() {
    setChoosing(true);
    await run('Loading permitted repositories…',async()=>{
      const value=await api<{installations:GithubInstallation[];hasMore:boolean}>('installations');
      if (!active.current) return;
      setAccounts(value.installations);setInstallPage(1);setMoreAccounts(value.hasMore);setRepositoryId('');setRepos([]);
      const first=value.installations[0];setInstallationId(first?String(first.id):'');
      if (first) await loadRepos(String(first.id));
    });
  }
  async function showMore() {
    if (!activity?.repository || !activity.head || !activity.hasMore) return;
    const previous=activity;
    await run('Loading more commits…',async()=>{
      const next=await api<GithubActivity>('activity','GET',undefined,{page:String(previous.page+1),head:previous.head!});
      if (!active.current) return;
      if (next.repository?.id!==previous.repository!.id || next.repository?.branch!==previous.repository!.branch) {
        await load();setNotice('The linked repository or default branch changed. Showing its latest commits.');return;
      }
      const seen=new Set(previous.commits.map(commit=>commit.sha));
      setActivity({...next,commits:[...previous.commits,...next.commits.filter(commit=>!seen.has(commit.sha))]});
    });
  }
  const disabled=!!busy;
  return <section aria-labelledby="github-activity-title" className="card mb-6" aria-busy={disabled}>
    <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
      <div><h2 id="github-activity-title" className="flex items-center gap-2 text-lg font-semibold text-slate-900"><Github size={19} aria-hidden="true"/>GitHub activity</h2><p className="mt-1 text-sm text-slate-500">Recent commits, for context. Activity never changes cards, tasks or progress.</p></div>
      <button ref={focus} className="secondary" disabled={disabled} onClick={()=>void run('Refreshing GitHub…',load)}><RefreshCw size={15} aria-hidden="true"/>Refresh</button>
    </div>
    <Feedback error={error} notice={notice}/>
    {busy && busy!=='Loading more commits…' && <Loading>{busy}</Loading>}
    {!connection && !busy && <p className="mb-3 text-sm text-slate-500">Use Refresh to load the GitHub connection.</p>}
    {connection && !connection.configured && <p className="text-sm text-slate-500">GitHub is not configured on this website yet. Ask the administrator to follow the GitHub App setup guide in the README.</p>}
    {connection?.configured && <>
      {!connection.connected || reconnect ? <div className="flex flex-wrap items-center gap-3"><p className="text-sm text-slate-600">{reconnect?'Reconnect to restore GitHub access.':'Connect your GitHub account, then allow access to selected repositories.'}</p><button className="button" disabled={disabled} onClick={()=>void connect()}>{reconnect?'Reconnect GitHub':'Connect GitHub'}</button></div> : <>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-slate-600">Connected as <strong>{connection.login}</strong></p><button className="secondary" disabled={disabled} onClick={()=>void run('Disconnecting GitHub…',async()=>{
          const value=await api<{notice:string}>('connection','DELETE');if (!active.current) return;
          setConnection({configured:true,connected:false});setActivity(null);setChoosing(false);setAccounts([]);setRepos([]);setRepositoryId('');setNotice(value.notice);
        })}>Disconnect GitHub</button></div>
        <div className="mb-4 flex flex-wrap gap-2"><button className="secondary" disabled={disabled} onClick={()=>void choose()}>{connection.linked?'Change repository':'Choose repository'}</button><button className="secondary" disabled={disabled} onClick={()=>void connect(true)}>Grant repository access on GitHub<ExternalLink size={13}/></button>{connection.linked && <button className="secondary" disabled={disabled} onClick={()=>void run('Removing repository link…',async()=>{
          await api('repository','DELETE');if (!active.current) return;setActivity(null);setConnection({...connection,linked:false});setChoosing(false);setNotice('Repository link removed. Your project and cards are unchanged.');
        })}>Remove repository link</button>}</div>
        {!connection.linked && !choosing && <p className="text-sm text-slate-500">No repository selected. Choose one to show commits from its default branch.</p>}
        {choosing && <form className="mb-5 space-y-4 rounded-xl border border-slate-200 bg-slate-50 p-4" onSubmit={event=>{event.preventDefault();void run('Linking repository…',async()=>{
          await api('repository','PUT',{installationId:Number(installationId),repositoryId:Number(repositoryId)});if (!active.current) return;
          setChoosing(false);setAccounts([]);setRepos([]);await load();if (active.current) {setNotice('Repository linked.');focus.current?.focus();}
        });}}>
          <h3 className="text-sm font-semibold text-slate-800">Select a permitted repository</h3>
          {!accounts.length && !busy && <p className="text-sm text-slate-600">No readable installations found. Use “Grant repository access on GitHub”, select an account, and choose repositories. Organization approval may be required.</p>}
          {!!accounts.length && <><label className="label">GitHub account<select className="field" disabled={disabled} value={installationId} onChange={event=>{
            const id=event.target.value;setInstallationId(id);setRepositoryId('');setRepos([]);void run('Loading repositories…',()=>loadRepos(id));
          }}>{accounts.map(account=><option key={account.id} value={account.id}>{account.account}</option>)}</select></label>
          <label className="label">Repository<select className="field" disabled={disabled || !repos.length} required value={repositoryId} onChange={event=>setRepositoryId(event.target.value)}><option value="">Choose a repository</option>{repos.map(repo=><option key={repo.id} value={repo.id}>{repo.fullName}{repo.private?' (private)':''}</option>)}</select></label>
          {!repos.length && !busy && <p className="text-sm text-slate-500">No repositories available for this installation. Check selected repositories and permissions on GitHub.</p>}</>}
          <div className="flex flex-wrap gap-2">{moreAccounts && <button type="button" className="secondary" disabled={disabled} onClick={()=>void run('Loading more accounts…',async()=>{
            const value=await api<{installations:GithubInstallation[];hasMore:boolean}>('installations','GET',undefined,{page:String(installPage+1)});if (!active.current)return;
            setAccounts(previous=>[...previous,...value.installations]);setInstallPage(installPage+1);setMoreAccounts(value.hasMore);
          })}>More accounts</button>}{moreRepos && <button type="button" className="secondary" disabled={disabled} onClick={()=>void run('Loading more repositories…',()=>loadRepos(installationId,repoPage+1,true))}>More repositories</button>}</div>
          <div className="flex flex-wrap gap-2"><button className="button" disabled={disabled || !repositoryId || !installationId}>Link repository</button><button type="button" className="secondary" disabled={disabled} onClick={()=>{setChoosing(false);focus.current?.focus();}}>Cancel</button></div>
        </form>}
        {activity?.repository && <div>
          <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm"><a className="inline-flex min-h-11 items-center gap-1 break-all font-medium text-indigo-700 underline" href={activity.repository.url} target="_blank" rel="noopener noreferrer">{activity.repository.fullName}<ExternalLink size={13}/></a><span className="inline-flex items-center gap-1 text-slate-600"><GitBranch size={14} aria-hidden="true"/>Default branch: <strong className="break-all">{activity.repository.branch}</strong></span><span className="text-xs text-slate-500">{activity.repository.private?'Private repository':'Public repository'}</span></div>
          {!activity.commits.length ? <p className="text-sm text-slate-500">No commits on this branch yet.</p> : <ol className="divide-y divide-slate-100">{activity.commits.map(commit=><li key={commit.sha} className="py-3 first:pt-0"><a className="inline-flex min-h-11 max-w-full items-center gap-2 break-words text-sm font-medium text-indigo-700 underline underline-offset-4" href={commit.url} target="_blank" rel="noopener noreferrer"><span>{commit.message.split('\n')[0]||'Untitled commit'}</span><ExternalLink size={13} className="shrink-0"/></a><p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500"><span className="break-words">{commit.author}</span>{commit.date && <time dateTime={commit.date}>{new Date(commit.date).toLocaleString()}</time>}<span className="font-mono">{commit.sha.slice(0,7)}</span></p></li>)}</ol>}
          {activity.hasMore && <button type="button" className="secondary mt-4" disabled={disabled} onClick={()=>void showMore()}>{busy==='Loading more commits…'?'Loading more…':'Show more'}</button>}
          <p className="mt-3 text-xs text-slate-400" role="status">Showing {activity.commits.length} commits. Updated {new Date(activity.checkedAt).toLocaleTimeString()}. Refresh returns to the latest 6.</p>
        </div>}
      </>}
      {reconnect && connection.connected && <button className="secondary mt-3" disabled={disabled} onClick={()=>void run('Disconnecting GitHub…',async()=>{const value=await api<{notice:string}>('connection','DELETE');if(active.current){setConnection({configured:true,connected:false});setReconnect(false);setActivity(null);setChoosing(false);setNotice(value.notice);}})}>Disconnect GitHub</button>}
    </>}
  </section>;
}
