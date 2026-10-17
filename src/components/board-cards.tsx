'use client';
import Link from 'next/link';
import { useRef, useState } from 'react';
import { Archive, ArrowUpRight, Check, ExternalLink, LoaderCircle } from 'lucide-react';
import { DeleteBoardCard } from './delete-board-card';
import { Disclosure } from './disclosure';
import { cardSurfaces, completionStatus, formatLabels, localDate, safeWebUrl, typeColors, type BoardCard, type BoardProject } from '@/lib/board';

type CardsProps = {
  cards: BoardCard[]; projects: BoardProject[]; busy: boolean;
  onUpdate: (card: BoardCard, patch: object, notice: string) => Promise<boolean>;
  onDelete: (card: BoardCard) => Promise<boolean>; onOpen?: () => void; fromProject?: string;
  panels?: Record<string,boolean>; onPanelChange?: (id: string,open: boolean) => void;
};
export function BoardCards({ cards,...props }: CardsProps) {
  return <div className="grid items-start gap-4 sm:grid-cols-2 xl:grid-cols-3">{cards.map(card => <BoardCardItem key={card.id} card={card} {...props}/>)}</div>;
}
function BoardCardItem({ card,projects,busy,onUpdate,onDelete,onOpen,fromProject,panels,onPanelChange }: Omit<CardsProps,'cards'> & { card:BoardCard }) {
  const [pending,setPending] = useState(''); const running = useRef(false);
  async function update(patch: object,notice: string,kind: string) {
    if (running.current || busy) return;
    running.current = true; setPending(kind);
    try { await onUpdate(card,patch,notice); } finally { running.current = false; setPending(''); }
  }
    const href = `/board/${card.id}${fromProject ? `?fromProject=${fromProject}` : ''}`;
    return <article aria-busy={!!pending} className={`flex min-w-0 flex-col rounded-2xl border p-5 shadow-xs ${cardSurfaces[card.type]}`}>
      <div className="flex flex-wrap items-center gap-2 text-xs"><span className={`rounded-full px-2.5 py-1 font-medium capitalize ${typeColors[card.type]}`}>{card.type}</span><span className="text-slate-600">{card.status === 'completed' ? 'Done' : card.status === 'resolved' ? 'Resolved' : card.type === 'problem' ? 'Open problem' : 'Open'}</span>{card.format && card.format !== 'text' && <span className="text-slate-500">· {formatLabels[card.format]}</span>}{card.archived_at && <span>Archived</span>}</div>
      <Link href={href} onClick={onOpen} className="my-4 flex items-start justify-between gap-3 font-semibold leading-6"><span className={`break-words ${card.type === 'task' && card.status === 'completed' ? 'text-slate-500 line-through' : ''}`}>{card.title}</span><ArrowUpRight size={17} className="mt-1 shrink-0 text-slate-500"/></Link>
      {card.body && (card.format === 'code' ? <pre className="mb-4 max-h-28 overflow-auto rounded-lg bg-white/65 p-3 text-xs text-slate-700"><code>{card.body}</code></pre> : <p className="mb-4 line-clamp-3 whitespace-pre-wrap break-words text-sm leading-6 text-slate-600">{card.format === 'decision' && <strong>Why: </strong>}{card.body}</p>)}
      {card.url && safeWebUrl.safeParse(card.url).success && <a className="mb-4 inline-flex items-center gap-2 self-start text-sm font-medium text-indigo-700 underline underline-offset-4" href={card.url} target="_blank" rel="noopener noreferrer">Open link<ExternalLink size={13}/></a>}
      <div className="mb-4 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">{card.category && <span>{card.category}</span>}<span className="max-w-full truncate">{projects.find(project => project.id === card.project_id)?.name ?? 'General'}</span>{card.due_date && <time dateTime={card.due_date} className={card.due_date < localDate() && card.status === 'open' ? 'font-medium text-rose-700' : ''}>{card.due_date < localDate() && card.status === 'open' ? 'Overdue · ' : 'Due · '}{card.due_date}</time>}</div>
      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-slate-900/5 pt-3"><Link className="text-sm font-medium text-slate-700 hover:underline" href={href} onClick={onOpen}>Open / edit</Link><button className="inline-flex min-h-11 min-w-24 items-center justify-center gap-1.5 rounded-lg px-2 text-sm font-medium text-slate-600 hover:bg-white/70" disabled={busy || !!pending} onClick={() => void update({ status: completionStatus(card) },'Status updated.','status')}>{pending === 'status' ? <LoaderCircle size={15} className="animate-spin"/> : <Check size={15}/>} {pending === 'status' ? 'Saving…' : card.status !== 'open' ? 'Reopen' : card.type === 'problem' ? 'Resolve' : 'Done'}</button></div>
      <Disclosure className="mt-2" label="Move & more" triggerClassName="text-xs font-medium text-slate-500" open={panels ? panels[card.id] ?? false : undefined} onOpenChange={open => onPanelChange?.(card.id,open)}><div className="mt-2 space-y-3 border-t border-slate-900/5 pt-3">
        <label className="label text-xs">{pending === 'move' ? 'Moving…' : 'Move to'}<select className="field" disabled={busy || !!pending} value={card.project_id ?? ''} onChange={event => void update({ project_id: event.target.value || null },'Card moved.','move')}><option value="">General (no project)</option>{projects.filter(project => !project.archived_at || project.id === card.project_id).map(project => <option key={project.id} value={project.id}>{project.name}{project.archived_at ? ' (archived)' : ''}</option>)}</select></label>
        <button className="secondary min-w-28" disabled={busy || !!pending} onClick={() => void update({ archived_at: card.archived_at ? null : new Date().toISOString() },card.archived_at ? 'Card restored.' : 'Card archived.','archive')}><Archive size={14}/>{pending === 'archive' ? 'Saving…' : card.archived_at ? 'Restore' : 'Archive'}</button>
        <DeleteBoardCard card={card} busy={busy} onDelete={() => onDelete(card)}/>
      </div></Disclosure>
    </article>;
}
