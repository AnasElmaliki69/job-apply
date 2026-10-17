'use client';
import { Plus } from 'lucide-react';

export function FloatingCreate({ label, onClick, disabled = false }: { label: string; onClick: () => void; disabled?: boolean }) {
  return <button type="button" className="floating-create group fixed bottom-6 right-5 z-20 inline-flex min-h-14 items-center gap-2 rounded-full bg-indigo-600 p-4 text-white shadow-lg hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50 sm:right-8" aria-label={label} disabled={disabled} onClick={onClick}><Plus size={23}/><span className="floating-create-label overflow-hidden whitespace-nowrap text-sm font-semibold">{label}</span></button>;
}
