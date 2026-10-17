'use client';
import { useState } from 'react';
import { Plus, SlidersHorizontal, ChevronDown, LayoutGrid, FolderOpen } from 'lucide-react';
import { Feedback, Heading, Loading } from './ui';
import { useBoard } from './use-board';
import { BoardCards } from './board-cards';
import { BoardProjects } from './board-projects';
import { BoardModal } from './board-modal';
import { ProjectForm } from './project-form';
import { QuickCapture } from './quick-capture';
import { useBoardMemory } from './use-board-memory';
import { changeBoardView } from '@/lib/board-memory';
import { cardTypes, filterCards, type BoardFilters } from '@/lib/board';
import { message } from '@/lib/schemas';

export default function Board() {
  const board = useBoard();
  const boardMemory = useBoardMemory(board.userId,board.loading);
  const { memory } = boardMemory; const { filters,filtersOpen } = memory;
  const [busy,setBusy] = useState(false); const [error,setError] = useState(''); const [notice,setNotice] = useState(''); const [creatingProject,setCreatingProject] = useState(false);
  async function act(operation: () => Promise<unknown>,notice: string) {
    if (busy) return false; setBusy(true); setError(''); setNotice('');
    try { await operation(); setNotice(notice); return true; } catch (err) { setError(message(err)); return false; } finally { setBusy(false); }
  }
  const setFilters = (change: (filters: BoardFilters) => BoardFilters) => boardMemory.update(value => ({ ...value,filters: change(value.filters) }));
  function view(view: BoardFilters['view'],project = '') { boardMemory.update(value => changeBoardView(value,view,project)); }
  function surface(surface: 'cards' | 'projects') { boardMemory.update(value => ({ ...value,surface,scrollY:0 })); setError(''); setNotice(''); window.scrollTo({ top:0,behavior:'instant' }); }
  const visible = filterCards(board.cards,filters);
  const categories = [...new Set(board.cards.map(card => card.category).filter(Boolean))].sort();
  const project = board.projects.find(project => project.id === filters.project);
  const title = filters.view === 'project' ? project?.name ?? 'Project' : ({ all:'All cards',general:'General',problems:'Problems',upcoming:'Upcoming',archive:'Archived cards' } as const)[filters.view];
  const change = (key: keyof BoardFilters,value: string) => setFilters(previous => ({ ...previous,[key]:value }));
  const activeFilters = [filters.search.trim(),filters.type,filters.category,filters.status,filters.due,filters.view === 'project' ? '' : filters.project].filter(Boolean).length;
  const clearFilters = () => setFilters(previous => ({ ...previous,project: previous.view === 'project' ? previous.project : '',search:'',type:'',category:'',status:'',due:'' }));
  const openCapture = () => { setError(''); boardMemory.update(value => ({ ...value,capturePanelOpen:true })); };
  return <>
    <Heading title="Board" subtitle="A little space to think clearly and move things forward." action={memory.surface === 'cards' && <button className="button" onClick={openCapture} disabled={board.loading || !!board.error}><Plus size={18}/>New card</button>}/>
    <div role="group" aria-label="Board content" className="mb-7 inline-flex rounded-2xl border border-slate-200 bg-slate-100/70 p-1.5">
      <button className={`board-switch inline-flex min-h-11 items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-medium ${memory.surface === 'cards' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-500 hover:text-slate-800'}`} aria-pressed={memory.surface === 'cards'} aria-controls="board-cards-view" onClick={() => surface('cards')}><LayoutGrid size={17}/>Cards</button>
      <button className={`board-switch inline-flex min-h-11 items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-medium ${memory.surface === 'projects' ? 'bg-white text-indigo-700 shadow-xs' : 'text-slate-500 hover:text-slate-800'}`} aria-pressed={memory.surface === 'projects'} aria-controls="board-projects-view" onClick={() => surface('projects')}><FolderOpen size={17}/>Projects</button>
    </div>
    <Feedback error={error || board.error} notice={notice}/>
    {board.error && <button className="secondary" onClick={board.retry}>Retry loading board</button>}
    {board.loading || !boardMemory.ready ? <Loading>Loading your board…</Loading> : !board.error && <>
      <section id="board-projects-view" hidden={memory.surface !== 'projects'}><BoardProjects projects={board.projects} cards={board.cards} search={memory.projectSearch} onSearch={projectSearch => boardMemory.update(value => ({ ...value,projectSearch }))} archived={memory.showArchivedProjects} onArchived={showArchivedProjects => boardMemory.update(value => ({ ...value,showArchivedProjects }))} onCreate={() => { setError(''); setCreatingProject(true); }} onOpen={boardMemory.rememberScroll}/></section>
      <section id="board-cards-view" hidden={memory.surface !== 'cards'} className="pb-8">
        <nav aria-label="Card views" className="mb-6 flex flex-wrap gap-2">{(['all','general','problems','upcoming','archive'] as const).map(item => <button key={item} aria-pressed={filters.view === item} className={filters.view === item ? 'button' : 'secondary'} onClick={() => view(item)}>{item === 'all' ? 'All' : item === 'archive' ? 'Archive' : item[0].toUpperCase()+item.slice(1)}</button>)}</nav>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold">{title} <span className="ml-1 text-sm font-normal text-slate-400">{visible.length}</span></h2><div className="flex flex-wrap items-center gap-3">{activeFilters > 0 && <button className="text-sm font-medium text-indigo-600" onClick={clearFilters}>Clear filters</button>}<button className="secondary" aria-expanded={filtersOpen} aria-controls="board-filter-panel" onClick={() => boardMemory.update(value => ({ ...value,filtersOpen:!value.filtersOpen }))}><SlidersHorizontal size={16}/>Search &amp; filters{activeFilters > 0 && <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs text-indigo-700">{activeFilters}</span>}<ChevronDown size={15} className={filtersOpen ? 'rotate-180' : ''}/></button></div></div>
        {filters.view === 'problems' && <p className="mb-4 text-sm text-slate-500">Open and resolved problems, with their solutions and outcomes one click away.</p>}
        {filters.view === 'upcoming' && <p className="mb-4 text-sm text-slate-500">Dated unfinished tasks and reminders, including overdue items. No notifications are sent.</p>}
        {filters.view === 'project' && <button className="mb-4 text-sm text-indigo-600" onClick={() => view('all')}>Show all cards instead</button>}
        <section id="board-filter-panel" aria-label="Search and filters" hidden={!filtersOpen} className="mb-5 rounded-2xl border border-slate-200 bg-white p-5"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <label className="label sm:col-span-2 lg:col-span-3">Search<input type="search" className="field" value={filters.search} onChange={event => change('search',event.target.value)} placeholder="Search title, notes, category or link"/></label>
          <label className="label">Type<select className="field" value={filters.type} onChange={event => change('type',event.target.value)}><option value="">All types</option>{cardTypes.map(type => <option key={type}>{type}</option>)}</select></label>
          <label className="label">Category<select className="field" value={filters.category} onChange={event => change('category',event.target.value)}><option value="">All categories</option>{categories.map(category => <option key={category}>{category}</option>)}</select></label>
          <label className="label">Project<select className="field" value={filters.project} disabled={filters.view === 'general' || filters.view === 'project'} onChange={event => change('project',event.target.value)}><option value="">All projects</option>{board.projects.map(project => <option key={project.id} value={project.id}>{project.name}{project.archived_at ? ' (archived)' : ''}</option>)}</select></label>
          <label className="label">Status<select className="field" value={filters.status} onChange={event => change('status',event.target.value)}><option value="">All statuses</option><option value="open">Open</option><option value="completed">Done</option><option value="resolved">Resolved</option></select></label>
          <label className="label">Due date<select className="field" value={filters.due} onChange={event => change('due',event.target.value)}><option value="">Any date</option><option value="overdue">Overdue</option><option value="today">Today</option><option value="future">After today</option><option value="undated">No date</option></select></label>
        </div></section>
        {!visible.length ? <div className="card py-14 text-center"><h3 className="text-lg font-semibold">{activeFilters ? 'No matching cards' : 'Room for your next thought'}</h3><p className="mt-3 text-sm text-slate-500">{activeFilters ? 'Try clearing filters or switching views.' : 'Save an idea, a task, or something you want to come back to.'}</p><button className="secondary mt-5" onClick={openCapture}><Plus size={16}/>New card</button></div> : <BoardCards cards={visible} projects={board.projects} busy={busy} onOpen={boardMemory.rememberScroll} onUpdate={(card,patch,notice) => act(() => board.updateCard(card,patch),notice)} onDelete={card => act(() => board.deleteCard(card),'Card permanently deleted.')}/>}
      </section>
      {memory.capturePanelOpen && <BoardModal title="New card" description="One thought is enough. Everything else can wait." busy={busy} onClose={() => boardMemory.update(value => ({ ...value,capturePanelOpen:false }))}><Feedback error={error}/><QuickCapture projects={board.projects} draft={memory.draft} onChange={draft => boardMemory.update(value => ({ ...value,draft }))} open={memory.captureOpen} onOpen={captureOpen => boardMemory.update(value => ({ ...value,captureOpen }))} defaultProject={filters.view === 'project' && !project?.archived_at ? filters.project : null} defaultType={filters.view === 'problems' ? 'problem' : filters.view === 'upcoming' ? 'reminder' : 'note'} busy={busy} onSave={async input => { const saved = await act(() => board.createCard(input),'Card saved.'); if (saved) boardMemory.update(value => ({ ...value,capturePanelOpen:false })); return saved; }}/></BoardModal>}
      {creatingProject && <BoardModal title="Create project" description="Start with a name. Give it direction when you're ready." busy={busy} onClose={() => setCreatingProject(false)}><Feedback error={error}/><ProjectForm busy={busy} onCancel={() => setCreatingProject(false)} onSave={async input => { const saved = await act(() => board.saveProject(input),'Project created.'); if (saved) setCreatingProject(false); return saved; }}/></BoardModal>}
    </>}
  </>;
}
