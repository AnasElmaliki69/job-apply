import { useEffect, useRef, useState, type FormEvent } from 'react';
import { createRoot } from 'react-dom/client';
import { createClient, type User } from '@supabase/supabase-js';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { authOptions, cardTypes, createSaver, freshDraft, loadProjects, payloadFor, readDraft, websiteUrl, writeDraft, submitsThought, SaveRejected, type Draft } from './capture';
import './style.css';

const url = import.meta.env.VITE_SUPABASE_URL ?? '';
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';
const configured = /^https:\/\//.test(url) && !!anon && !anon.includes('YOUR_');
const client = configured ? createClient(url, anon, { auth: authOptions, global: { fetch: (input, init) => fetch(input, { ...init, signal: init?.signal ?? AbortSignal.timeout(20000) }) } }) : null;
const saveCard = client ? createSaver(client) : null;
type Settings = { shortcut: string; error: string | null };
const native = <T,>(command: string, args?: Record<string, unknown>) => isTauri() ? invoke<T>(command, args) : Promise.reject(new Error('Open this window with npm run desktop:dev. Native controls are unavailable in a browser.'));
const explain = (error: unknown) => error instanceof Error ? error.message : 'Something went wrong. Your draft is kept; please retry.';

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false); const lock = useRef(false);
  const [error, setError] = useState(''); const [success, setSuccess] = useState('');
  const [online, setOnline] = useState(navigator.onLine);
  const [draft, setDraft] = useState<Draft>(freshDraft);
  const [storageError, setStorageError] = useState('');
  const [draftBlocked, setDraftBlocked] = useState(false);
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);
  const [projectError, setProjectError] = useState(''); const [projectBusy, setProjectBusy] = useState(false);
  const [options, setOptions] = useState(false); const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<Settings>({ shortcut: 'Ctrl+Alt+Shift+Space', error: null });
  const [shortcut, setShortcut] = useState(settings.shortcut); const [settingBusy, setSettingBusy] = useState(false);
  const input = useRef<HTMLTextAreaElement>(null); const emailInput = useRef<HTMLInputElement>(null);
  const currentUser = useRef<string | null>(null);
  const focus = () => (input.current ?? emailInput.current)?.focus();

  async function refreshProjects(id: string) {
    if (!client) return;
    setProjectBusy(true); setProjectError('');
    try { const rows = await loadProjects(client, id); if (currentUser.current === id) setProjects(rows); }
    catch (error) { if (currentUser.current === id) setProjectError(explain(error)); }
    finally { if (currentUser.current === id) setProjectBusy(false); }
  }
  useEffect(() => {
    const subscription = client?.auth.onAuthStateChange((_event, session) => {
      const next = session?.user ?? null;
      setUser(next);
      if (currentUser.current === (next?.id ?? null)) return;
      currentUser.current = next?.id ?? null;
      setProjects([]); setDraft(freshDraft()); setStorageError(''); setDraftBlocked(false); setSuccess(''); setError('');
      if (next) {
        try { setDraft(readDraft(localStorage, next.id)); }
        catch (error) { setStorageError(explain(error)); setDraftBlocked(true); }
        // Do not await a Supabase query inside the auth callback.
        setTimeout(() => { void refreshProjects(next.id); focus(); }, 0);
      } else { setDraft(freshDraft()); setPassword(''); }
    });
    const connected = () => setOnline(navigator.onLine);
    window.addEventListener('online', connected); window.addEventListener('offline', connected);
    const stops: (() => void)[] = []; let disposed = false;
    if (isTauri()) {
      void listen('capture-focus', () => { focus(); if (currentUser.current) void refreshProjects(currentUser.current); }).then(stop => { if (disposed) stop(); else stops.push(stop); }).catch(error => setError(explain(error)));
      void listen<string>('capture-error', event => setError(event.payload)).then(stop => { if (disposed) stop(); else stops.push(stop); }).catch(error => setError(explain(error)));
      void native<Settings>('get_settings', { websiteUrl: websiteUrl(import.meta.env.VITE_WEBSITE_URL ?? 'http://localhost:3000') }).then(value => { setSettings(value); setShortcut(value.shortcut); }).catch(error => setError(explain(error)));
    }
    focus();
    return () => { disposed = true; subscription?.data.subscription.unsubscribe(); stops.forEach(stop => stop()); window.removeEventListener('online', connected); window.removeEventListener('offline', connected); };
  }, []);

  function keep(value: Draft) {
    if (!user) return false;
    try { writeDraft(localStorage, user.id, value); setStorageError(''); setDraft(value); return true; }
    catch { setStorageError('Local draft storage is unavailable. Keep this window open until storage is available.'); setDraft(value); return false; }
  }
  async function login(event: FormEvent) {
    event.preventDefault(); if (!client || lock.current) return;
    lock.current = true; setBusy(true); setError('');
    try {
      const result = await client.auth.signInWithPassword({ email: email.trim(), password });
      if (result.error) throw result.error;
      setPassword('');
    } catch (error) { setError(explain(error)); }
    finally { lock.current = false; setBusy(false); }
  }
  async function save() {
    if (!user || !saveCard || lock.current || draftBlocked) return;
    setError(''); setSuccess('');
    if (!navigator.onLine) { setError('You are offline. Draft kept on this device. Reconnect, then press Enter to retry.'); return; }
    lock.current = true; setBusy(true);
    try {
      const payload = payloadFor(draft, user.id);
      // Persist the exact request before sending it, so even an app restart can safely retry.
      if (!keep({ ...draft, attempt: payload })) throw new Error('Cannot safely save until local draft storage is available.');
      await saveCard(payload);
      const cleared = freshDraft();
      try { writeDraft(localStorage, user.id, cleared); }
      catch { throw new Error('Card saved, but the draft could not be cleared. Retry is safe; it will not create another card.'); }
      setDraft(cleared); setStorageError('');
      setSuccess('Saved to your Board. Ready for the next thought.');
    } catch (error) { if (error instanceof SaveRejected) keep({ ...draft, attempt: null }); setError(explain(error)); }
    finally { lock.current = false; setBusy(false); input.current?.focus(); }
  }
  async function hide() {
    if (storageError) { setError('Keep this window open: the draft could not be saved on this device.'); return; }
    try { await native('hide_capture'); } catch (error) { setError(explain(error)); }
  }
  async function openWebsite() {
    try { await native('open_website', { url: websiteUrl(import.meta.env.VITE_WEBSITE_URL ?? 'http://localhost:3000') }); }
    catch (error) { setError(explain(error)); }
  }
  const frozen = busy || !!draft.attempt || draftBlocked;
  return <main onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); if (settingsOpen) setSettingsOpen(false); else if (options) setOptions(false); else void hide(); } }}>
    <header><div><span className="brand">JobApply</span><span className="subtitle">Quick capture</span></div><div className="actions"><button onClick={() => { setSettingsOpen(value => !value); setOptions(false); }} aria-expanded={settingsOpen}>Settings</button><button onClick={() => void hide()} aria-label="Hide capture window">✕</button></div></header>
    {!configured && <p role="alert" className="error">Configure the public Supabase values in desktop/quick-capture/.env.local, then restart. Never add server secrets.</p>}
    {!online && <p role="status" className="notice">Offline · Your draft stays here. Reconnect before saving.</p>}
    {error && <p role="alert" className="error">{error}</p>}
    {storageError && <p role="alert" className="error">{storageError}</p>}
    {settings.error && <p role="alert" className="notice">{settings.error} Use the tray icon, or choose another shortcut.</p>}
    {settingsOpen && <section aria-label="Capture settings" className="panel"><form onSubmit={async event => {
      event.preventDefault(); if (settingBusy) return; setSettingBusy(true); setError('');
      try { const value = await native<Settings>('set_shortcut', { shortcut }); setSettings(value); setShortcut(value.shortcut); setSuccess('Shortcut updated.'); }
      catch (error) { setError(explain(error)); }
      finally { setSettingBusy(false); }
    }}><label>Global shortcut<input value={shortcut} onChange={event => setShortcut(event.target.value)} required placeholder="Ctrl+Alt+Shift+Space"/></label><p className="hint">Use Ctrl+Alt+Shift plus Space or a letter. If another app uses it, choose a different key.</p><button className="primary" disabled={settingBusy}>{settingBusy ? 'Updating…' : 'Save shortcut'}</button></form><button onClick={() => void openWebsite()}>Open website ↗</button></section>}
    {!user ? <form onSubmit={login} className="signin"><h1>A place for your next thought.</h1><p>Sign in with your existing JobApply account. You stay signed in while the companion runs in the tray.</p><label>Email<input ref={emailInput} type="email" autoComplete="username" value={email} onChange={event => setEmail(event.target.value)} required disabled={busy}/></label><label>Password<input type="password" autoComplete="current-password" value={password} onChange={event => setPassword(event.target.value)} required disabled={busy}/></label><button className="primary" disabled={busy || !client || !online}>{busy ? 'Signing in…' : 'Sign in'}</button><p className="hint">Your password and session are never written to disk. Sign in again after quitting.</p></form>
    : <form onSubmit={event => { event.preventDefault(); void save(); }} aria-busy={busy}>
      <label className="capture-label" htmlFor="thought">What’s on your mind?</label>
      <textarea id="thought" ref={input} placeholder="An idea, a task, something to remember…" rows={5} maxLength={10000} value={draft.text} readOnly={frozen} onChange={event => { setSuccess(''); setError(''); keep({ ...draft, text: event.target.value }); }} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); if (submitsThought({ ...event, isComposing: event.nativeEvent.isComposing })) void save(); } }}/>
      <div className="capture-meta"><button type="button" onClick={() => setOptions(value => !value)} aria-expanded={options}>Options · {draft.type} · {projects.find(project => project.id === draft.project)?.name ?? (draft.project ? 'Selected project' : 'General')}</button><span className="hint">Shift+Enter for a new line</span></div>
      {options && <div className="options"><label>Type<select value={draft.type} disabled={frozen} onChange={event => keep({ ...draft, type: event.target.value as Draft['type'] })}>{cardTypes.map(type => <option key={type}>{type}</option>)}</select></label><label>Project<select value={draft.project} disabled={frozen || projectBusy} onChange={event => keep({ ...draft, project: event.target.value })}><option value="">General</option>{draft.project && !projects.some(project => project.id === draft.project) && <option value={draft.project}>Previously selected project</option>}{projects.map(project => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label><div className="hint">{projectBusy ? 'Loading projects…' : projectError || 'Only your active projects.'} <button type="button" disabled={projectBusy} onClick={() => void refreshProjects(user.id)}>Refresh</button></div></div>}
      {draft.attempt && !busy && <p className="notice">This save needs confirmation. Retry to finish the same card safely before editing or starting another.</p>}
      <div role="status" aria-live="polite">{success && <p className="success">{success}</p>}</div>
      <footer><span className="hint">{busy ? 'Saving…' : draft.text ? 'Draft kept on this device' : `Open anywhere: ${settings.shortcut}`}</span><button className="primary" disabled={busy || draftBlocked || !draft.text.trim() || !online}>{busy ? 'Saving…' : draft.attempt ? 'Retry save ↵' : 'Save card ↵'}</button></footer>
      <div className="account"><span title={user.email}>{user.email}</span><button type="button" onClick={() => void openWebsite()}>Open Board ↗</button><button type="button" disabled={busy} onClick={async () => { if (lock.current) return; await client?.auth.signOut({ scope: 'local' }); }}>Sign out</button></div>
    </form>}
  </main>;
}
createRoot(document.getElementById('root')!).render(<App/>);
