'use client';
import { useState } from 'react';
import { Copy, Check } from 'lucide-react';

export function CopyLetter({ text }: { text: string }) {
  const [state, setState] = useState<'idle' | 'copying' | 'copied' | 'error'>('idle');
  async function copy() {
    setState('copying');
    try { await navigator.clipboard.writeText(text); setState('copied'); }
    catch { setState('error'); }
  }
  return <div><button type="button" className="secondary" disabled={state === 'copying'} onClick={copy}>{state === 'copied' ? <Check size={15}/> : <Copy size={15}/>}{state === 'copied' ? 'Letter copied' : state === 'copying' ? 'Copying…' : 'Copy letter'}</button>{state === 'copied' && <span role="status" className="sr-only">Cover letter copied to clipboard.</span>}{state === 'error' && <p role="alert" className="mt-2 text-xs text-rose-700">Clipboard access is unavailable. Select and copy the letter text below.</p>}</div>;
}
