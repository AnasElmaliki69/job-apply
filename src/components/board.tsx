'use client';
import Link from 'next/link';
import { useRef, useState, type FormEvent } from 'react';
import { Plus, Archive, Check, ArrowUpRight, SlidersHorizontal, ChevronDown } from 'lucide-react';
import { Feedback, Heading, Loading } from './ui';
import { useBoard } from './use-board';
import { DeleteBoardCard } from './delete-board-card';
import { cardInput, cardTypes, completionStatus, filterCards, localDate, projectInput, typeColors, type BoardCard, type BoardFilters, type BoardProject } from '@/lib/board';
import { message } from '@/lib/schemas';

export function CardForm({ projects, card, defaultProject = null, defaultType = 'note', busy, onSave }: {
  projects: BoardProject[]; card?: BoardCard; defaultProject?: string | null; defaultType?: BoardCard['type']; busy: boolean;
  onSave: (input: ReturnType<typeof cardInput.parse>) => Promise<boolean>;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError('');
    const form = event.currentTarget; const data = new FormData(form);
    const parsed = cardInput.safeParse({ title: data.get('title'), type: card?.type ?? data.get('type'), body: data.get('body') ?? '', category: data.get('category') ?? '', project_id: data.get('project_id') || null, due_date: data.get('due_date') || null });
    if (!parsed.success) { setError(parsed.error.issues[0].message); return; }
    if (await onSave(parsed.data) && !card) { form.reset(); form.querySelector<HTMLInputElement>('[name="title"]')?.focus(); }
  }
  return <form ref={formRef} onSubmit={submit}><fieldset disabled={busy} className="space-y-4">
    <Feedback error={error}/>
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end"><label className="label min-w-0 flex-1">{card ? 'Title' : 'What’s on your mind?'}<input className="field" name="title" required maxLength={300} defaultValue={card?.title} placeholder="An idea, a task, a problem…" autoComplete="off"/></label><button className="button shrink-0" disabled={busy}>{busy ? 'Saving…' : card ? 'Save changes' : <><Plus size={16}/>Save card</>}</button></div>
    <details open={!!card}><summary className="cursor-pointer text-sm text-slate-600">{card ? 'Card details' : 'Optional details'}</summary><div className="mt-4 grid gap-4 sm:grid-cols-2">
      {!card && <label className="label">Type<select className="field capitalize" name="type" defaultValue={defaultType}>{cardTypes.map(type => <option key={type} value={type}>{type}</option>)}</select></label>}
      <label className="label">Category<input className="field" name="category" maxLength={100} list="board-categories" defaultValue={card?.category} placeholder="Gym, studies, personal…"/><datalist id="board-categories"><option>Gym</option><option>Studies</option><option>Personal</option><option>Projects</option></datalist></label>
      <label className="label">Project<select className="field" name="project_id" defaultValue={card?.project_id ?? defaultProject ?? ''}><option value="">General (no project)</option>{projects.filter(project => !project.archived_at || project.id === card?.project_id).map(project => <option key={project.id} value={project.id}>{project.name}{project.archived_at ? ' (archived)' : ''}</option>)}</select></label>
      <label className="label">Due date<input type="date" className="field" name="due_date" defaultValue={card?.due_date ?? ''}/></label>
      <label className="label sm:col-span-2">Notes<textarea className="field" rows={card ? 5 : 3} name="body" maxLength={10000} defaultValue={card?.body} placeholder="Add context whenever you need it."/></label>
    </div></details>
  </fieldset></form>;
}

function ProjectRow({ project, busy, onSave, onView }: { project: BoardProject; busy: boolean; onSave: (name: string, project: BoardProject, archived?: string | null) => Promise<boolean>; onView: () => void }) {
  const [name, setName] = useState(project.name);
  return <form onSubmit={event => { event.preventDefault(); void onSave(name, project); }} className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 p-3">
    <input aria-label={`Rename ${project.name}`} className="field m-0 min-w-0 flex-1" value={name} maxLength={100} required onChange={event => setName(event.target.value)}/>
    <button className="secondary" disabled={busy}>Rename</button><button type="button" className="secondary" onClick={onView}>View</button>
    <button type="button" className="secondary" disabled={busy} onClick={() => void onSave(project.name, project, project.archived_at ? null : new Date().toISOString())}>{project.archived_at ? 'Restore project' : 'Archive project'}</button>
    {project.archived_at && <span className="text-xs text-slate-500">Archived project · cards retained</span>}
  </form>;
}

export default function Board() {
  const board = useBoard();
  const [filters, setFilters] = useState<BoardFilters>({ view: 'all', project: '', search: '', type: '', category: '', status: '', due: '' });
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [notice, setNotice] = useState(''); const [projectName, setProjectName] = useState('');
  async function act(operation: () => Promise<unknown>, notice: string) {
    if (busy) return false;
    setBusy(true); setError(''); setNotice('');
    try { await operation(); setNotice(notice); return true; } catch (err) { setError(message(err)); return false; } finally { setBusy(false); }
  }
  function view(view: BoardFilters['view'], project = '') { setFiltersOpen(false); setFilters(previous => ({ ...previous, view, project, type: '', category: '', status: '', due: '', search: '' })); }
  const visible = filterCards(board.cards, filters);
  const categories = [...new Set(board.cards.map(card => card.category).filter(Boolean))].sort();
  const activeProjects = board.projects.filter(project => !project.archived_at);
  const project = board.projects.find(project => project.id === filters.project);
  const title = filters.view === 'project' ? project?.name ?? 'Project' : ({ all: 'All cards', general: 'General', problems: 'Problems', upcoming: 'Upcoming', archive: 'Archived cards' } as const)[filters.view];
  const change = (key: keyof BoardFilters, value: string) => setFilters(previous => ({ ...previous, [key]: value }));
  const activeFilters = [filters.search.trim(), filters.type, filters.category, filters.status, filters.due, filters.view === 'project' ? '' : filters.project].filter(Boolean).length;
  const clearFilters = () => setFilters(previous => ({ ...previous, project: previous.view === 'project' ? previous.project : '', search: '', type: '', category: '', status: '', due: '' }));
  return <>
    <Heading title="Board" subtitle="A place for your ideas, tasks, reminders and everyday problems."/>
    <Feedback error={error || board.error} notice={notice}/>
    {board.error && <button className="secondary" onClick={board.retry}>Retry loading board</button>}
    {board.loading ? <Loading>Loading your board…</Loading> : !board.error && <>
      <section className="card mb-6" aria-label="Quick capture"><CardForm key={`${filters.view}:${filters.project}`} projects={board.projects} defaultProject={filters.view === 'project' && !project?.archived_at ? filters.project : null} defaultType={filters.view === 'problems' ? 'problem' : filters.view === 'upcoming' ? 'reminder' : 'note'} busy={busy} onSave={input => act(() => board.createCard(input), 'Card saved.')}/></section>
      <nav aria-label="Board views" className="mb-5 flex flex-wrap gap-2">{(['all','general','problems','upcoming','archive'] as const).map(item => <button key={item} aria-pressed={filters.view === item} className={filters.view === item ? 'button' : 'secondary'} onClick={() => view(item)}>{item === 'all' ? 'All' : item === 'archive' ? 'Archive' : item[0].toUpperCase() + item.slice(1)}</button>)}{activeProjects.map(project => <button key={project.id} aria-pressed={filters.view === 'project' && filters.project === project.id} className={filters.view === 'project' && filters.project === project.id ? 'button' : 'secondary'} onClick={() => view('project', project.id)}>{project.name}</button>)}</nav>
      <details className="mb-5 rounded-xl border border-slate-200 bg-white px-4 py-3"><summary className="cursor-pointer text-sm font-medium text-slate-600">Manage projects</summary><p className="my-3 text-sm text-slate-500">Archiving hides a project from navigation. Its cards remain in All and keep their project association.</p>
        <form className="mb-4 flex flex-col gap-2 sm:flex-row" onSubmit={async event => { event.preventDefault(); if (await act(() => board.saveProject(projectInput.parse(projectName)), 'Project created.')) setProjectName(''); }}><label className="label flex-1">New project<input className="field" value={projectName} onChange={event => setProjectName(event.target.value)} required maxLength={100} placeholder="Studies, home renovation…"/></label><button className="button self-end" disabled={busy}>Create project</button></form>
        <div className="space-y-2">{board.projects.map(project => <ProjectRow key={`${project.id}:${project.updated_at}`} project={project} busy={busy} onSave={(name, record, archived) => act(() => board.saveProject(projectInput.parse(name), record, archived), 'Project updated.')} onView={() => view('project', project.id)}/>)}</div>
      </details>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">{title} <span className="text-sm font-normal text-slate-500">{visible.length} cards</span></h2>
        <div className="flex flex-wrap items-center gap-3">
          {activeFilters > 0 && <button className="text-sm font-medium text-indigo-600" onClick={clearFilters}>Clear filters</button>}
          <button className="secondary" aria-expanded={filtersOpen} aria-controls="board-filter-panel" onClick={() => setFiltersOpen(open => !open)}><SlidersHorizontal size={16}/>Search &amp; filters{activeFilters > 0 && <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-semibold text-indigo-700" aria-label={`${activeFilters} active filters`}>{activeFilters}</span>}<ChevronDown size={15} className={filtersOpen ? 'rotate-180' : ''}/></button>
        </div>
      </div>
      {filters.view === 'problems' && <p className="mb-4 text-sm text-slate-500">Open problems and resolved problems are labeled below. Open one to track solutions and outcomes.</p>}
      {filters.view === 'upcoming' && <p className="mb-4 text-sm text-slate-500">Unfinished tasks and reminders with a date, including overdue items. No notifications are sent.</p>}
      <section id="board-filter-panel" aria-label="Search and filters" hidden={!filtersOpen} className="mb-5 rounded-xl border border-slate-200 bg-white p-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className="label sm:col-span-2 lg:col-span-3">Search<input type="search" className="field" value={filters.search} onChange={event => change('search', event.target.value)} placeholder="Search title, notes or category"/></label>
        <label className="label">Type<select className="field" value={filters.type} onChange={event => change('type', event.target.value)}><option value="">All types</option>{cardTypes.map(type => <option key={type}>{type}</option>)}</select></label>
        <label className="label">Category<select className="field" value={filters.category} onChange={event => change('category', event.target.value)}><option value="">All categories</option>{categories.map(category => <option key={category}>{category}</option>)}</select></label>
        <label className="label">Project<select className="field" value={filters.project} disabled={filters.view === 'general' || filters.view === 'project'} onChange={event => change('project', event.target.value)}><option value="">All projects</option>{board.projects.map(project => <option key={project.id} value={project.id}>{project.name}{project.archived_at ? ' (archived)' : ''}</option>)}</select></label>
        <label className="label">Status<select className="field" value={filters.status} onChange={event => change('status', event.target.value)}><option value="">All statuses</option><option value="open">Open</option><option value="completed">Done</option><option value="resolved">Resolved</option></select></label>
        <label className="label">Due date<select className="field" value={filters.due} onChange={event => change('due', event.target.value)}><option value="">Any date</option><option value="overdue">Overdue</option><option value="today">Today</option><option value="future">After today</option><option value="undated">No date</option></select></label>
        </div>
      </section>
      {!visible.length ? <div className="card py-12 text-center"><h3 className="font-semibold">Nothing here yet</h3><p className="mt-2 text-sm text-slate-500">Capture a card above, switch views, or clear your filters.</p></div> : <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{visible.map(card => <article className="card flex min-w-0 flex-col" key={card.id}>
        <div className="flex flex-wrap items-center gap-2 text-xs"><span className={`rounded-full px-3 py-1 capitalize ${typeColors[card.type]}`}>{card.type}</span><span className="font-medium">{card.status === 'completed' ? 'Done' : card.status === 'resolved' ? 'Resolved' : card.type === 'problem' ? 'Open problem' : 'Open'}</span>{card.archived_at && <span>Archived</span>}</div>
        <Link href={`/board/${card.id}`} className="my-4 flex items-start justify-between gap-2 font-semibold"><span className="break-words">{card.title}</span><ArrowUpRight size={17} className="shrink-0 text-slate-400"/></Link>
        {card.body && <p className="mb-4 line-clamp-3 whitespace-pre-wrap break-words text-sm text-slate-500">{card.body}</p>}
        <div className="mb-4 flex flex-wrap gap-2 text-xs text-slate-500">{card.category && <span>{card.category}</span>}<span>{board.projects.find(project => project.id === card.project_id)?.name ?? 'General'}</span>{card.due_date && <time dateTime={card.due_date} className={card.due_date < localDate() && card.status === 'open' ? 'font-semibold text-rose-700' : ''}>{card.due_date < localDate() && card.status === 'open' ? 'Overdue · ' : 'Due · '}{card.due_date}</time>}</div>
        <div className="mt-auto flex flex-wrap gap-2"><Link className="secondary" href={`/board/${card.id}`}>Edit / details</Link><button className="secondary" disabled={busy} onClick={() => void act(() => board.updateCard(card, { status: completionStatus(card) }), 'Status updated.')}><Check size={14}/>{card.status !== 'open' ? 'Reopen' : card.type === 'problem' ? 'Resolve' : 'Done'}</button><button className="secondary" disabled={busy} onClick={() => void act(() => board.updateCard(card, { archived_at: card.archived_at ? null : new Date().toISOString() }), card.archived_at ? 'Card restored.' : 'Card archived. Find it in Archive.')}><Archive size={14}/>{card.archived_at ? 'Restore' : 'Archive'}</button></div>
        <div className="mt-3"><DeleteBoardCard card={card} busy={busy} onDelete={() => act(() => board.deleteCard(card), 'Card permanently deleted.')}/></div>
      </article>)}</div>}
    </>}
  </>;
}
