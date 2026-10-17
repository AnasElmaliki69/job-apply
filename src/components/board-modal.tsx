'use client';
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

// Native dialog supplies focus containment, inert background and Escape semantics.
export function BoardModal({ title, description, busy = false, onClose, children }: {
  title: string; description?: string; busy?: boolean; onClose: () => void; children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null); const titleId = useId(); const descriptionId = useId();
  useEffect(() => {
    const element = dialog.current; if (!element) return;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    element.showModal(); document.body.style.overflow = 'hidden';
    element.querySelector<HTMLElement>('[data-autofocus]')?.focus();
    return () => { element.close(); document.body.style.overflow = overflow; if (previous?.isConnected) previous.focus(); };
  },[]);
  return <dialog ref={dialog} aria-labelledby={titleId} aria-describedby={description ? descriptionId : undefined}
    className="board-modal m-auto max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-0 text-slate-900 shadow-xl backdrop:bg-slate-950/35"
    onCancel={event => { event.preventDefault(); if (!busy) onClose(); }} onClick={event => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <div className="p-5 sm:p-7"><div className="mb-5 flex items-start justify-between gap-4"><div><h2 className="text-xl font-semibold" id={titleId}>{title}</h2>{description && <p className="mt-2 text-sm leading-6 text-slate-500" id={descriptionId}>{description}</p>}</div><button type="button" className="secondary shrink-0 p-2.5" aria-label="Close dialog" disabled={busy} onClick={onClose}><X size={18}/></button></div>{children}</div>
  </dialog>;
}
