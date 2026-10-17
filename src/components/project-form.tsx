'use client';
import { useState, type FormEvent } from 'react';
import { projectDetailsInput, type BoardProject } from '@/lib/board';
import { Feedback } from './ui';

export function ProjectForm({ project, busy, onSave, onCancel }: { project?: BoardProject; busy: boolean; onSave: (input: ReturnType<typeof projectDetailsInput.parse>) => Promise<boolean>; onCancel: () => void }) {
  const [error,setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError('');
    const data = new FormData(event.currentTarget);
    const parsed = projectDetailsInput.safeParse({ name: data.get('name'),goal: data.get('goal') ?? '',description: data.get('description') ?? '',repository_url: data.get('repository_url') ?? '',source_links: String(data.get('source_links') ?? '').split(/\r?\n/).map(value => value.trim()).filter(Boolean) });
    if (!parsed.success) { setError(parsed.error.issues[0].message); return; }
    await onSave(parsed.data);
  }
  return <form onSubmit={submit}><fieldset disabled={busy} className="space-y-4"><Feedback error={error}/>
    <label className="label">Project name <span className="font-normal text-slate-400">(required)</span><input data-autofocus className="field" name="name" required maxLength={100} defaultValue={project?.name} placeholder="What are you working on?"/></label>
    <label className="label">Goal <span className="font-normal text-slate-400">(optional)</span><textarea className="field" name="goal" rows={2} maxLength={5000} defaultValue={project?.goal} placeholder="What would a good result look like?"/></label>
    <details open={!!project}><summary className="cursor-pointer text-sm font-medium text-slate-500">Links & other details <span className="font-normal">· optional</span></summary><div className="mt-4 space-y-4">
      <label className="label">Git repository URL<input className="field" name="repository_url" type="url" maxLength={2000} defaultValue={project?.repository_url} placeholder="https://github.com/you/project"/></label>
      <label className="label">Source links<textarea className="field" name="source_links" rows={3} defaultValue={project?.source_links?.join('\n')} placeholder="One full https:// URL per line (up to 20)" maxLength={40020}/></label>
      <label className="label">Other details<textarea className="field" name="description" rows={3} maxLength={10000} defaultValue={project?.description} placeholder="Background, constraints or useful context"/></label>
    </div></details>
    <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-4"><button type="button" className="secondary" onClick={onCancel}>Cancel</button><button className="button" disabled={busy}>{busy ? 'Saving…' : project ? 'Save project' : 'Create project'}</button></div>
  </fieldset></form>;
}
