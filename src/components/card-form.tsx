'use client';
import { useState, type FormEvent } from 'react';
import { cardFormats, cardInput, formatLabels, type BoardCard, type BoardProject } from '@/lib/board';
import { Feedback } from './ui';

export function CardForm({ projects, card, busy, onSave }: { projects: BoardProject[]; card: BoardCard; busy: boolean; onSave: (input: ReturnType<typeof cardInput.parse>) => Promise<boolean> }) {
  const [error,setError] = useState(''); const [format,setFormat] = useState(card.format ?? 'text');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); const data = new FormData(event.currentTarget);
    const parsed = cardInput.safeParse({ title: data.get('title'),type: card.type,body: data.get('body') ?? '',category: data.get('category') ?? '',project_id: data.get('project_id') || null,due_date: data.get('due_date') || null,format,url: data.get('url') ?? '' });
    if (!parsed.success) { setError(parsed.error.issues[0].message); return; }
    await onSave(parsed.data);
  }
  return <form aria-busy={busy} onSubmit={submit}><fieldset disabled={busy} className="space-y-4"><Feedback error={error}/>
    <label className="label">{format === 'decision' ? 'What I chose' : 'Title'}<input className="field" name="title" required maxLength={300} defaultValue={card.title}/></label>
    <div className="grid gap-4 sm:grid-cols-2"><label className="label">Content format<select className="field" value={format} onChange={event => setFormat(event.target.value as typeof format)}>{cardFormats.map(value => <option key={value} value={value}>{formatLabels[value]}</option>)}</select></label>
      <label className="label">Project<select className="field" name="project_id" defaultValue={card.project_id ?? ''}><option value="">General (no project)</option>{projects.filter(project => !project.archived_at || project.id === card.project_id).map(project => <option key={project.id} value={project.id}>{project.name}{project.archived_at ? ' (archived)' : ''}</option>)}</select></label>
      <label className="label">Category<input className="field" name="category" maxLength={100} defaultValue={card.category}/></label>
      <label className="label">Due date<input type="date" className="field" name="due_date" defaultValue={card.due_date ?? ''}/></label>
    </div>
    <label className="label">URL <span className="font-normal text-slate-400">(optional)</span><input type="url" className="field" name="url" maxLength={2000} defaultValue={card.url ?? ''} placeholder="https://…"/></label>
    <label className="label">{format === 'decision' ? 'Why I chose this' : format === 'code' ? 'Code snippet' : 'Notes'}<textarea className={`field ${format === 'code' ? 'font-mono' : ''}`} rows={7} name="body" maxLength={10000} defaultValue={card.body}/></label>
    <p className="text-xs text-slate-500">Card type: {card.type}. The type stays fixed to preserve problem and solution history.</p>
    <button className="button min-w-36" disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button>
  </fieldset></form>;
}
