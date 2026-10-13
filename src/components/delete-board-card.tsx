'use client';
import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import type { BoardCard } from '@/lib/board';

export function DeleteBoardCard({ card, busy, onDelete }: { card: BoardCard; busy: boolean; onDelete: () => Promise<boolean> }) {
  const [confirming, setConfirming] = useState(false);
  if (!confirming) return <button type="button" className="secondary text-rose-700" disabled={busy} onClick={() => setConfirming(true)}><Trash2 size={14}/>Delete</button>;
  return <div role="group" aria-label={`Confirm deletion of ${card.title}`} className="w-full rounded-xl border border-rose-200 bg-rose-50 p-4">
    <p className="break-words text-sm font-semibold text-rose-900">Delete “{card.title}” permanently?</p>
    <p className="my-3 text-sm text-rose-800">{card.type === 'problem' ? 'This also deletes all attached solutions, attempts and outcomes. ' : ''}This cannot be undone. Use Archive to keep your history.</p>
    <div className="flex flex-wrap gap-2"><button type="button" className="button bg-rose-700 hover:bg-rose-800" disabled={busy} onClick={async () => { if (await onDelete()) setConfirming(false); }}>{busy ? 'Deleting…' : 'Delete permanently'}</button><button type="button" className="secondary" disabled={busy} onClick={() => setConfirming(false)}>Cancel</button></div>
  </div>;
}
