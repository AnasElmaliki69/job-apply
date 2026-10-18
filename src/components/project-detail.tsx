'use client';
import { Disclosure } from './disclosure';
import Link from 'next/link';
import { useState } from 'react';
import { Plus, ExternalLink, Pencil, Archive } from 'lucide-react';
import { useBoard } from './use-board';
import { useBoardMemory } from './use-board-memory';
import { BoardCards } from './board-cards';
import { BoardModal } from './board-modal';
import { ProjectForm } from './project-form';
import { ProjectProgress } from './board-projects';
import { QuickCapture } from './quick-capture';
import { Feedback, Heading, Loading } from './ui';
import { projectCardGroups, safeWebUrl, type BoardCard } from '@/lib/board';
import { useActionFeedback } from './use-action-feedback';
import { WorkspaceFeedback } from './workspace-feedback';
import { ProjectGithub } from './project-github';

export default function ProjectDetail({ id }: { id: string }) {
  const board = useBoard(); const project = board.projects.find(project => project.id === id);
  const state = useBoardMemory(board.userId ? `${board.userId}:project:${id}` : undefined,board.loading);
  const { busy,error,notice,setError,setNotice,act } = useActionFeedback(); const [editing,setEditing] = useState(false);

  function capture(type: BoardCard['type'] = 'note',format: NonNullable<BoardCard['format']> = 'text') {
    setError(''); state.update(value => ({ ...value,capturePanelOpen:true,captureOpen: value.captureOpen || format !== 'text',draft: value.draft ?? { title:'',body:'',category:'',due_date:null,project_id:id,type,format,url:'' } }));
  }
  if (board.loading || !state.ready) return <Loading>Loading project…</Loading>;
  if (board.error) return <><Feedback error={board.error}/><button className="secondary" onClick={board.retry}>Retry project</button></>;
  if (!project) return <div className="card"><h1 className="text-xl font-semibold">Project not found</h1><p className="my-4 text-sm text-slate-500">It may have been moved or belong to another account.</p><Link href="/board" className="secondary">Back to Board</Link></div>;
  const groups = projectCardGroups(board.cards,id);
  const archived = board.cards.filter(card => card.project_id === id && !!card.archived_at);
  const sections = [
    { key:'tasks',title:'Tasks',cards:groups.tasks,type:'task',format:'text',action:'Add task',empty:'Break your goal into a first small step.',open:true },
    { key:'resources',title:'Resources',cards:groups.resources,type:'note',format:'link',action:'Add link',empty:'Keep links and code snippets close to your work.',open:true },
    { key:'decisions',title:'Decisions',cards:groups.decisions,type:'note',format:'decision',action:'Record decision',empty:'Capture what you chose and why.',open:false },
    { key:'notes',title:'Ideas, notes & related cards',cards:groups.notes,type:'note',format:'text',action:'Add card',empty:'Thoughts, problems and solutions for this project live here.',open:false },
    { key:'archive',title:'Archived cards',cards:archived,type:'note',format:'text',action:'',empty:'No archived cards. Archiving keeps your history.',open:false },
  ] as const;
  const links = (project.source_links ?? []).filter(url => safeWebUrl.safeParse(url).success);
  return <>
    <Link href="/board" className="mb-5 inline-block text-sm font-medium text-indigo-600">← Back to Board</Link>
    <Heading title={project.name} subtitle="Direction, progress and useful context, together." action={<button className="secondary" disabled={busy} onClick={() => { setError(''); setEditing(true); }}><Pencil size={15}/>Edit project</button>}/>
    <WorkspaceFeedback error={error} notice={notice} busy={busy}/>
    {project.archived_at && <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><p>This project is archived. Its cards and history are still here.</p><button className="secondary" disabled={busy} onClick={() => void act(() => board.saveProject(project.name,project,null),'Project restored.')}>Restore project</button></div>}
    <section className="card mb-6"><div className="grid gap-6 sm:grid-cols-[1fr_220px]"><div><h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Goal</h2><p className="mt-3 whitespace-pre-wrap break-words text-base leading-7 text-slate-700">{project.goal || 'What are you hoping to achieve? Add a goal whenever you’re ready.'}</p>{!project.goal && <button className="mt-3 text-sm font-medium text-indigo-600" onClick={() => setEditing(true)}>Add a goal →</button>}</div><div className="self-center"><ProjectProgress cards={board.cards} project={project}/><p className="mt-3 text-xs text-slate-400">Based on active task cards. Archived tasks are excluded.</p></div></div>
      {(project.description || project.repository_url || links.length > 0) && <Disclosure label="Project context & source links" triggerClassName="text-sm font-medium text-slate-600" className="mt-5 border-t border-slate-100 pt-4" open={state.memory.projectPanels.context ?? false} onOpenChange={open => { state.update(value => ({ ...value,projectPanels:{ ...value.projectPanels,context:open } })); }}><div className="mt-4 space-y-3">{project.description && <p className="whitespace-pre-wrap break-words text-sm leading-6 text-slate-600">{project.description}</p>}{project.repository_url && safeWebUrl.safeParse(project.repository_url).success && <a href={project.repository_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-sm text-indigo-700 underline">Git repository<ExternalLink size={13}/></a>}{links.length > 0 && <ul className="space-y-2">{links.map((url,index) => <li key={`${url}:${index}`}><a href={url} target="_blank" rel="noopener noreferrer" className="break-all text-sm text-indigo-700 underline underline-offset-4">{url}</a></li>)}</ul>}</div></Disclosure>}
    </section>
    <ProjectGithub projectId={id}/>
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-slate-500">All items below are regular Board cards. Move them between projects or General.</p><button className="button" disabled={busy || !!project.archived_at} onClick={() => capture()}><Plus size={16}/>New card</button></div>
    <div className="space-y-5">{sections.map(section => <Disclosure label={<>{section.title} <span className="ml-2 text-sm font-normal text-slate-400">{section.cards.length}</span></>} triggerClassName="text-base font-semibold text-slate-800" key={section.key} className="rounded-2xl border border-slate-200 bg-white/60 p-4 sm:p-5" open={state.memory.projectPanels[section.key] ?? section.open} onOpenChange={open => { state.update(value => ({ ...value,projectPanels:{ ...value.projectPanels,[section.key]:open } })); }}>

      <div className="mt-5">{section.action && <div className="mb-4 flex flex-wrap gap-2"><button className="secondary" disabled={busy || !!project.archived_at} onClick={() => capture(section.type,section.format)}><Plus size={15}/>{section.action}</button>{section.key === 'resources' && <button className="secondary" disabled={busy || !!project.archived_at} onClick={() => capture('note','code')}><Plus size={15}/>Add code snippet</button>}</div>}
        {!section.cards.length ? <p className="py-3 text-sm text-slate-500">{section.empty}</p> : <BoardCards cards={section.cards} projects={board.projects} busy={busy} fromProject={id} onOpen={state.rememberScroll} panels={state.memory.cardPanels} onPanelChange={(id,open) => state.update(value => ({ ...value,cardPanels:{ ...value.cardPanels,[id]:open } }))} onUpdate={(card,patch,notice) => act(() => board.updateCard(card,patch),notice)} onDelete={card => act(() => board.deleteCard(card),'Card permanently deleted.')}/>}
      </div>
    </Disclosure>)}</div>
    <div className="mt-8 border-t border-slate-200 pt-5"><button className="secondary" disabled={busy} onClick={() => void act(() => board.saveProject(project.name,project,project.archived_at ? null : new Date().toISOString()),project.archived_at ? 'Project restored.' : 'Project archived. Its cards and history are retained.')}><Archive size={15}/>{project.archived_at ? 'Restore project' : 'Archive project'}</button></div>
    {editing && <BoardModal title="Edit project" description="Give the work direction. All details can change later." busy={busy} onClose={() => setEditing(false)}><Feedback error={error}/><ProjectForm project={project} busy={busy} onCancel={() => setEditing(false)} onSave={async input => { const saved = await act(() => board.saveProject(input,project),'Project updated.'); if (saved) setEditing(false); return saved; }}/></BoardModal>}
    {state.memory.capturePanelOpen && <BoardModal title="New project card" description="Tasks, ideas, decisions and material share the same card system." busy={busy} onClose={() => state.update(value => ({ ...value,capturePanelOpen:false }))}><Feedback error={error}/><QuickCapture projects={board.projects} draft={state.memory.draft} onChange={draft => state.update(value => ({ ...value,draft }))} open={state.memory.captureOpen} onOpen={captureOpen => state.update(value => ({ ...value,captureOpen }))} defaultProject={id} defaultType="note" busy={busy} onSave={async input => { const section = input.type === 'task' ? 'tasks' : ['link','code'].includes(input.format) ? 'resources' : input.format === 'decision' ? 'decisions' : 'notes'; const saved = await act(() => board.createCard(input),'Card saved.'); if (saved) state.update(value => ({ ...value,capturePanelOpen:false,projectPanels:input.project_id === id ? { ...value.projectPanels,[section]:true } : value.projectPanels })); return saved; }}/></BoardModal>}
  </>;
}
