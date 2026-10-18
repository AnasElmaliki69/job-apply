import type { SupabaseClient } from '@supabase/supabase-js';
// Tests and the UI use this package's SDK instance, independently of the website's lockfile.
export { createClient } from '@supabase/supabase-js';
import { cardInput, cardTypes } from '../../../src/lib/board';
export { cardTypes };
export type CardType = typeof cardTypes[number];
export type Payload = ReturnType<typeof cardInput.parse> & { id: string; user_id: string };
export type Draft = { id: string; text: string; type: CardType; project: string; attempt: Payload | null };
export const authOptions = { persistSession: false, autoRefreshToken: true, detectSessionInUrl: false } as const;
export const draftKey = (user: string) => `jobapply:capture:v1:${user}`;
export function submitsThought(event: { key: string; shiftKey: boolean; repeat: boolean; isComposing: boolean }) {
  return event.key === 'Enter' && !event.shiftKey && !event.repeat && !event.isComposing;
}
export class SaveRejected extends Error {}
export const freshDraft = (): Draft => ({ id: crypto.randomUUID(), text: '', type: 'note', project: '', attempt: null });
export function readDraft(storage: Pick<Storage, 'getItem'>, user: string): Draft {
  const raw = storage.getItem(draftKey(user));
  if (!raw) return freshDraft();
  const value = JSON.parse(raw) as Draft;
  if (!/^[a-f0-9-]{36}$/i.test(value.id) || typeof value.text !== 'string' || value.text.length > 10300 || !cardTypes.includes(value.type) || typeof value.project !== 'string') throw new Error('Stored draft is unreadable. It has been kept on disk; contact support before clearing it.');
  if (value.attempt) {
    const { id, user_id, ...fields } = value.attempt;
    cardInput.parse(fields);
    if (id !== value.id || user_id !== user) throw new Error('Stored save attempt does not belong to this account.');
  }
  return { ...value, attempt: value.attempt ?? null };
}
export function writeDraft(storage: Pick<Storage, 'setItem'>, user: string, draft: Draft) {
  storage.setItem(draftKey(user), JSON.stringify(draft));
}
export function payloadFor(draft: Draft, user: string): Payload {
  if (draft.attempt) {
    if (draft.attempt.user_id !== user) throw new Error('Sign in with the account that started this save.');
    return draft.attempt;
  }
  const text = draft.text.trim();
  const [first, ...rest] = text.split(/\r?\n/);
  // A long thought retains its full content in the body, with a short scannable title.
  const title = first.slice(0, 300);
  const body = first.length > 300 ? text : rest.join('\n');
  return { ...cardInput.parse({ title, body, type: draft.type, project_id: draft.project || null }), id: draft.id, user_id: user };
}
export async function loadProjects(client: SupabaseClient, user: string) {
  const projects: { id: string; name: string }[] = [];
  let last = '';
  for (;;) {
    let query = client.from('board_projects').select('id,name').eq('user_id', user).is('archived_at', null).order('id').limit(500);
    if (last) query = query.gt('id', last);
    const result = await query;
    if (result.error) throw new Error('Could not load projects. Retry, or save to General.');
    projects.push(...result.data);
    if (result.data.length < 500) return projects.sort((a, b) => a.name.localeCompare(b.name));
    last = result.data[result.data.length - 1].id;
  }
}
export function createSaver(client: SupabaseClient) {
  let saving = false;
  return async (payload: Payload) => {
    if (saving) throw new Error('A save is already in progress.');
    saving = true;
    try {
      const result = await client.from('board_cards').insert(payload).select('id').single();
      if (!result.error) return;
      // A timed-out response may have committed. Retry the same UUID, never upsert.
      if (result.error.code === '23505') {
        const existing = await client.from('board_cards').select('id').eq('id', payload.id).eq('user_id', payload.user_id).maybeSingle();
        if (!existing.error && existing.data) return;
      }
      if (['42501', 'PGRST301', '23503', '23514', '22001'].includes(result.error.code)) throw new SaveRejected(result.error.code === '23503' ? 'This project is no longer available. Choose General or refresh projects and retry.' : 'Save rejected. Check your session, Board migration and card fields, then retry. Your draft is kept.');
      throw new Error('Could not confirm the save. Your draft is kept. Retry when connected; it will not create a duplicate.');
    } finally { saving = false; }
  };
}
export function websiteUrl(raw: string) {
  const url = new URL(raw);
  if (url.username || url.password || !(url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)))) throw new Error('Website URL must use HTTPS, or HTTP on localhost for development.');
  return new URL('/board', url.origin).href;
}
