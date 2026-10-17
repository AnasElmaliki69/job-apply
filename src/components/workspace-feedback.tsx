'use client';
import { useEffect, useState } from 'react';
import { CheckCircle2, LoaderCircle, X } from 'lucide-react';

// Feedback overlays the workspace rather than inserting a banner above the grid.
// Errors stay until dismissed; success notices clear after five seconds.
export function WorkspaceFeedback({ error, notice, busy }: { error?: string; notice?: string; busy?: boolean }) {
  const [dismissed,setDismissed] = useState(false);
  useEffect(() => {
    setDismissed(false);
    if (notice && !error && !busy) { const timer = setTimeout(() => setDismissed(true),5000); return () => clearTimeout(timer); }
  },[error,notice,busy]);
  if (dismissed || (!error && !notice && !busy)) return null;
  return <div className="workspace-feedback pointer-events-none fixed inset-x-4 top-4 z-30 mx-auto max-w-md md:left-68" key={error || notice || 'saving'}>
    <div className={`pointer-events-auto flex items-start gap-3 rounded-xl border p-4 text-sm shadow-lg ${error ? 'border-red-200 bg-red-50 text-red-800' : 'border-slate-200 bg-white text-slate-700'}`}>
      {busy ? <LoaderCircle size={18} aria-hidden="true" className="mt-0.5 shrink-0 animate-spin text-indigo-600"/> : !error && <CheckCircle2 size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-emerald-600"/>}
      <p className="min-w-0 flex-1 break-words leading-6" role={error ? 'alert' : 'status'}>{error || (busy ? 'Saving changes…' : notice)}</p>
      {!busy && <button type="button" aria-label="Dismiss message" className="-my-1 rounded-lg p-2" onClick={() => setDismissed(true)}><X size={16}/></button>}
    </div>
  </div>;
}
