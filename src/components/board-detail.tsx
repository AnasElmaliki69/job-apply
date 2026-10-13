'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { CardForm } from './board';
import { useBoard } from './use-board';
import { DeleteBoardCard } from './delete-board-card';
import { Feedback, Heading, Loading } from './ui';
import { completionStatus, outcomeLabels, outcomes, solutionInput, typeColors, type BoardSolution } from '@/lib/board';
import { message } from '@/lib/schemas';

function SolutionForm({ solution, busy, onSave, onCancel }: { solution?: BoardSolution; busy: boolean; onSave: (input: ReturnType<typeof solutionInput.parse>) => Promise<boolean>; onCancel?: () => void }) {
  const [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); const form = event.currentTarget; const values = Object.fromEntries(new FormData(form));
    const parsed = solutionInput.safeParse(values);
    if (!parsed.success) { setError(parsed.error.issues[0].message); return; }
    if (await onSave(parsed.data) && !solution) form.reset();
  }
  return <form onSubmit={submit}><fieldset disabled={busy} className="space-y-4">
    <Feedback error={error}/>
    <label className="label">Solution<input className="field" name="title" required maxLength={300} defaultValue={solution?.title} placeholder="Something you could try"/></label>
    <details open={!!solution}><summary className="cursor-pointer text-sm text-slate-600">Attempt and outcome (optional)</summary><div className="mt-4 space-y-4">
      <label className="label">What I tried<textarea className="field" rows={3} name="tried" maxLength={10000} defaultValue={solution?.tried}/></label>
      <label className="label">Result / outcome notes<textarea className="field" rows={3} name="result" maxLength={10000} defaultValue={solution?.result}/></label>
      <label className="label">Outcome<select className="field" name="outcome" defaultValue={solution?.outcome ?? 'not_tried'}>{outcomes.map(outcome => <option key={outcome} value={outcome}>{outcomeLabels[outcome]}</option>)}</select></label>
    </div></details>
    <div className="flex gap-2"><button className="button" disabled={busy}>{busy ? 'Saving…' : solution ? 'Save solution' : 'Add solution'}</button>{onCancel && <button type="button" className="secondary" disabled={busy} onClick={onCancel}>Cancel</button>}</div>
  </fieldset></form>;
}

export default function BoardDetail({ id }: { id: string }) {
  const router = useRouter();
  const board = useBoard(); const card = board.cards.find(card => card.id === id);
  const [solutions, setSolutions] = useState<BoardSolution[]>([]); const [solutionsLoading, setSolutionsLoading] = useState(false); const [solutionsError, setSolutionsError] = useState(''); const [attempt, setAttempt] = useState(0);
  const [editing, setEditing] = useState<string | null>(null); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const isProblem = card?.type === 'problem';
  useEffect(() => {
    if (!board.client || !board.userId || !isProblem) return;
    let active = true; setSolutionsLoading(true); setSolutionsError(''); setSolutions([]);
    void (async () => {
      try {
        const { data, error } = await board.client!.from('board_solutions').select('*').eq('user_id', board.userId!).eq('problem_id', id).order('created_at');
        if (error) throw error;
        if (active) setSolutions((data ?? []) as BoardSolution[]);
      } catch (err) { if (active) setSolutionsError(message(err)); }
      finally { if (active) setSolutionsLoading(false); }
    })();
    return () => { active = false; };
  }, [board.client, board.userId, id, isProblem, attempt]);
  async function act(operation: () => Promise<unknown>, notice: string) {
    if (busy) return false; setBusy(true); setError(''); setNotice('');
    try { await operation(); setNotice(notice); return true; } catch (err) { setError(message(err)); return false; } finally { setBusy(false); }
  }
  if (board.loading) return <Loading>Loading card…</Loading>;
  if (board.error) return <><Feedback error={board.error}/><button className="secondary" onClick={board.retry}>Retry</button></>;
  if (!card) return <div className="card"><h1 className="text-xl font-semibold">Card not found</h1><p className="my-4 text-sm text-slate-500">It may belong to a different account.</p><Link className="secondary" href="/board">Back to Board</Link></div>;
  return <>
    <Link href="/board" className="mb-5 inline-block text-sm font-medium text-indigo-600">← Back to Board</Link>
    <Heading title={card.type === 'problem' ? 'Problem details' : 'Card details'} subtitle="Keep your notes and progress together."/>
    <Feedback error={error} notice={notice}/>
    <div className="mb-5 flex flex-wrap items-center gap-3"><span className={`rounded-full px-3 py-1 text-sm capitalize ${typeColors[card.type]}`}>{card.type}</span><span className="font-medium">{card.status === 'completed' ? 'Done' : card.status === 'resolved' ? 'Resolved' : 'Open'}</span>{card.archived_at && <span className="text-sm text-slate-500">Archived</span>}<button className="secondary" disabled={busy} onClick={() => void act(() => board.updateCard(card, { status: completionStatus(card) }), 'Status updated.')}>{card.status !== 'open' ? 'Reopen' : isProblem ? 'Mark resolved' : 'Mark done'}</button><button className="secondary" disabled={busy} onClick={() => void act(() => board.updateCard(card, { archived_at: card.archived_at ? null : new Date().toISOString() }), 'Archive status updated.')}>{card.archived_at ? 'Restore card' : 'Archive card'}</button></div>
    <div className="mb-5"><DeleteBoardCard card={card} busy={busy} onDelete={() => act(async () => { await board.deleteCard(card); router.replace('/board'); }, 'Card permanently deleted.')}/></div>
    <section className="card mb-6"><CardForm key={`${card.id}:${card.updated_at}`} card={card} projects={board.projects} busy={busy} onSave={input => act(() => board.updateCard(card, input), 'Card updated.')}/><p className="mt-4 text-xs text-slate-500">Created {new Date(card.created_at).toLocaleString()} · Updated {new Date(card.updated_at).toLocaleString()}</p></section>
    {isProblem && <section aria-label="Problem solutions" className="space-y-5">
      <div><h2 className="text-xl font-semibold">Solutions and attempts</h2><p className="mt-2 text-sm text-slate-500">Add possibilities now. Record what you tried and what happened later. Outcomes do not automatically resolve the problem.</p></div>
      <Feedback error={solutionsError}/>{solutionsError && <button className="secondary" onClick={() => setAttempt(value => value + 1)}>Retry solutions</button>}
      {solutionsLoading ? <Loading>Loading solutions…</Loading> : !solutionsError && <>
        {!solutions.length && <div className="card text-sm text-slate-500">No solutions yet. Start with one idea below.</div>}
        {solutions.map(solution => <article className="card" key={`${solution.id}:${solution.updated_at}`}>
          {editing === solution.id ? <SolutionForm solution={solution} busy={busy} onCancel={() => setEditing(null)} onSave={input => act(async () => { const saved = await board.saveSolution(card, input, solution); setSolutions(previous => previous.map(item => item.id === saved.id ? saved : item)); setEditing(null); }, 'Solution updated.')}/> : <>
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3"><h3 className="break-words font-semibold">{solution.title}</h3><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium">{outcomeLabels[solution.outcome]}{solution.archived_at ? ' · Archived' : ''}</span></div>
            <dl className="space-y-4 text-sm"><div><dt className="font-medium">What I tried</dt><dd className="mt-1 whitespace-pre-wrap break-words text-slate-600">{solution.tried || 'Nothing recorded yet.'}</dd></div><div><dt className="font-medium">Result</dt><dd className="mt-1 whitespace-pre-wrap break-words text-slate-600">{solution.result || 'No result recorded yet.'}</dd></div></dl>
            <div className="mt-5 flex flex-wrap gap-2"><button className="secondary" disabled={busy} onClick={() => setEditing(solution.id)}>Edit attempt / result</button><button className="secondary" disabled={busy} onClick={() => void act(async () => { const saved = await board.saveSolution(card, { archived_at: solution.archived_at ? null : new Date().toISOString() }, solution); setSolutions(previous => previous.map(item => item.id === saved.id ? saved : item)); }, 'Solution archive status updated.')}>{solution.archived_at ? 'Restore solution' : 'Archive solution'}</button></div>
          </>}
        </article>)}
        <div className="card"><h3 className="mb-4 font-semibold">Add a solution</h3><SolutionForm busy={busy} onSave={input => act(async () => { const saved = await board.saveSolution(card, input); setSolutions(previous => [...previous, saved]); }, 'Solution added.')}/></div>
      </>}
    </section>}
  </>;
}
