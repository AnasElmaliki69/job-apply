'use client';
import Link from 'next/link';
import { ArrowUpRight, Plus } from 'lucide-react';
import { projectProgress, type BoardCard, type BoardProject } from '@/lib/board';
import { FloatingCreate } from './floating-create';

export function ProjectProgress({ cards, project }: { cards: BoardCard[]; project: BoardProject }) {
  const progress = projectProgress(cards,project.id);
  return <div className="space-y-2"><div className="flex items-center justify-between gap-2 text-xs text-slate-500"><span>{progress.total ? `${progress.completed} of ${progress.total} tasks complete` : 'No tasks yet'}</span><span>{progress.total ? `${progress.percent}%` : '—'}</span></div><progress aria-label={`${project.name} task progress`} max={100} value={progress.percent} className="project-progress block h-1.5 w-full overflow-hidden rounded-full"/></div>;
}
export function BoardProjects({ projects, cards, search, onSearch, archived, onArchived, onCreate, onOpen }: {
  projects: BoardProject[]; cards: BoardCard[]; search: string; onSearch: (value: string) => void;
  archived: boolean; onArchived: (value: boolean) => void; onCreate: () => void; onOpen: () => void;
}) {
  const visible = projects.filter(project => (!project.archived_at || archived) && `${project.name} ${project.goal ?? ''} ${project.description ?? ''}`.toLowerCase().includes(search.trim().toLowerCase()));
  return <section className="pb-24" aria-label="Projects"><div className="mb-5 flex flex-wrap items-end justify-between gap-4"><label className="label w-full sm:max-w-xs">Find a project<input type="search" className="field" value={search} onChange={event => onSearch(event.target.value)} placeholder="Search name or goal"/></label><label className="flex min-h-11 items-center gap-2 text-sm text-slate-600"><input type="checkbox" checked={archived} onChange={event => onArchived(event.target.checked)}/>Show archived projects</label></div>
    {!visible.length ? <div className="card py-14 text-center"><h2 className="text-lg font-semibold">{search ? 'No matching projects' : archived ? 'No archived projects' : 'Give your next idea a home'}</h2><p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-slate-500">{search ? 'Try another name or a word from its goal.' : archived ? 'Archived projects keep their cards and can be restored.' : 'Start with a name. Add a goal, tasks and useful material as you go.'}</p>{!archived && !search && <button className="secondary mt-5" onClick={onCreate}><Plus size={16}/>Create project</button>}</div> : <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{visible.map(project => <Link key={project.id} href={`/board/projects/${project.id}`} onClick={onOpen} className="card flex min-w-0 flex-col transition-colors hover:border-indigo-300"><div className="flex items-start justify-between gap-3"><h2 className="break-words text-lg font-semibold">{project.name}</h2><ArrowUpRight size={18} className="mt-1 shrink-0 text-slate-400"/></div>{project.archived_at && <p className="mt-2 text-xs font-medium text-slate-500">Archived · history kept</p>}<p className="mb-6 mt-3 line-clamp-3 text-sm leading-6 text-slate-500">{project.goal || 'Add a goal to give this project direction.'}</p><div className="mt-auto"><ProjectProgress cards={cards} project={project}/></div></Link>)}</div>}
    <FloatingCreate label="Create project" onClick={onCreate}/>
  </section>;
}
