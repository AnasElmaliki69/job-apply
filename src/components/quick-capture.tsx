'use client';
import { useRef, useState, type FormEvent } from 'react';
import { Plus } from 'lucide-react';
import { cardInput, cardTypes, typeColors, type BoardCard, type BoardProject } from '@/lib/board';
import type { CaptureDraft } from '@/lib/board-memory';
import { Feedback } from './ui';

export function QuickCapture({ projects, draft, onChange, open, onOpen, defaultProject, defaultType, busy, onSave }: {
  projects: BoardProject[]; draft: CaptureDraft | null; onChange: (draft: CaptureDraft | null) => void;
  open: boolean; onOpen: (open: boolean) => void; defaultProject: string | null; defaultType: BoardCard['type'];
  busy: boolean; onSave: (input: ReturnType<typeof cardInput.parse>) => Promise<boolean>;
}) {
  const input = useRef<HTMLInputElement>(null); const [error, setError] = useState('');
  const value: CaptureDraft = draft ?? { title: '', body: '', type: defaultType, project_id: defaultProject, due_date: null, category: '' };
  const change = (patch: Partial<CaptureDraft>) => { setError(''); onChange({ ...value, ...patch }); };
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); const parsed = cardInput.safeParse(value);
    if (!parsed.success) { setError(parsed.error.issues[0].message); return; }
    if (await onSave(parsed.data)) { onChange(null); input.current?.focus(); }
  }
  const projectName = projects.find(project => project.id === value.project_id)?.name ?? 'General';
  return <form onSubmit={submit}><fieldset disabled={busy} className="space-y-3">
    <Feedback error={error}/>
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end"><label className="label min-w-0 flex-1">What’s on your mind?<input ref={input} className="field" required maxLength={300} value={value.title} onChange={event => change({ title: event.target.value })} placeholder="An idea, a task, a problem…" autoComplete="off"/></label><button className="button shrink-0" disabled={busy}>{busy ? 'Saving…' : <><Plus size={16}/>Save card</>}</button></div>
    <div className="flex flex-wrap gap-2" role="group" aria-label="Card type">{cardTypes.map(type => <button type="button" key={type} aria-pressed={value.type === type} onClick={() => change({ type })} className={`rounded-full border px-3 py-1.5 text-xs font-medium capitalize ${value.type === type ? `${typeColors[type]} border-current` : 'border-slate-200 text-slate-500 hover:bg-slate-50'}`}>{type}</button>)}</div>
    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500"><span>Saving to {projectName}{draft ? ' · Draft kept in this browser tab' : ''}</span>{draft && <button type="button" className="font-medium text-indigo-600" onClick={() => { setError(''); onChange(null); }}>Clear draft</button>}</div>
    <details open={open} onToggle={event => onOpen(event.currentTarget.open)}><summary className="cursor-pointer text-sm text-slate-600">Optional details</summary><div className="mt-4 grid gap-4 sm:grid-cols-2">
      <label className="label">Category<input className="field" maxLength={100} list="capture-categories" value={value.category} onChange={event => change({ category: event.target.value })} placeholder="Gym, studies, personal…"/><datalist id="capture-categories"><option>Gym</option><option>Studies</option><option>Personal</option><option>Projects</option></datalist></label>
      <label className="label">Project<select className="field" value={value.project_id ?? ''} onChange={event => change({ project_id: event.target.value || null })}><option value="">General (no project)</option>{projects.filter(project => !project.archived_at || project.id === value.project_id).map(project => <option key={project.id} value={project.id}>{project.name}{project.archived_at ? ' (archived)' : ''}</option>)}</select></label>
      <label className="label">Due date<input type="date" className="field" value={value.due_date ?? ''} onChange={event => change({ due_date: event.target.value || null })}/></label>
      <label className="label sm:col-span-2">Notes<textarea className="field" rows={3} maxLength={10000} value={value.body} onChange={event => change({ body: event.target.value })} placeholder="Add context whenever you need it."/></label>
    </div></details>
  </fieldset></form>;
}
