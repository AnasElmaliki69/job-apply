import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createClient, authOptions, createSaver, draftKey, freshDraft, loadProjects, payloadFor, readDraft, SaveRejected, submitsThought, websiteUrl, writeDraft } from '../desktop/quick-capture/src/capture';
import { cardTypes, filterCards, type BoardCard } from '../src/lib/board';
const user = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const project = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
function storage() {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
}
function clientWith(fetcher: typeof fetch) {
  return createClient('https://test.supabase.co', 'public-test-key', { auth: authOptions, accessToken: async () => 'signed-in-user-token', global: { fetch: fetcher } });
}

test('desktop uses existing card types and validation, preserving multiline and long thoughts', () => {
  for (const type of cardTypes) {
    const payload = payloadFor({ ...freshDraft(), text: '  Think about this\nSecond line  ', type, project }, user);
    assert.equal(payload.title, 'Think about this'); assert.equal(payload.body, 'Second line');
    assert.equal(payload.type, type); assert.equal(payload.project_id, project);
    assert.equal(payload.user_id, user); assert.equal(payload.format, 'text');
  }
  assert.throws(() => payloadFor({ ...freshDraft(), text: '   ' }, user));
  assert.throws(() => payloadFor({ ...freshDraft(), text: 'X', project: 'bad-project' }, user));
  const text = 'x'.repeat(301) + '\nRest';
  const payload = payloadFor({ ...freshDraft(), text }, user);
  assert.equal(payload.title.length, 300); assert.equal(payload.body, text);
});

test('draft and exact pending request survive closing/restarting and stay separated by account', () => {
  const disk = storage(); const original = { ...freshDraft(), text: 'Keep me', type: 'task' as const, project };
  const pending = { ...original, attempt: payloadFor(original, user) };
  writeDraft(disk, user, pending);
  const restored = readDraft(disk, user);
  assert.deepEqual(restored, pending); assert.deepEqual(payloadFor(restored, user), pending.attempt);
  assert.equal(readDraft(disk, other).text, '');
  assert.throws(() => payloadFor(restored, other), /account/);
  disk.setItem(draftKey(other), JSON.stringify(pending));
  assert.throws(() => readDraft(disk, other), /account/);
  disk.setItem(draftKey(user), 'broken'); assert.throws(() => readDraft(disk, user));
  assert.equal(disk.getItem(draftKey(user)), 'broken', 'corrupt data is preserved, not silently cleared');
  assert.throws(() => writeDraft({ setItem: () => { throw new Error('Full disk'); } }, user, original));
});

test('Enter saves once, Shift+Enter inserts a line, and key repeats/IME composition do not submit', () => {
  const key = { key: 'Enter', shiftKey: false, repeat: false, isComposing: false };
  assert.equal(submitsThought(key), true);
  for (const patch of [{ shiftKey: true }, { repeat: true }, { isComposing: true }, { key: 'Escape' }]) assert.equal(submitsThought({ ...key, ...patch }), false);
});

test('save locks synchronously and the website reads the same owner-scoped Board card', async () => {
  let release!: () => void;
  const hold = new Promise<void>(resolve => { release = resolve; });
  const rows: BoardCard[] = []; let posts = 0;
  const client = clientWith(async (input, init) => {
    const url = new URL(String(input));
    assert.equal(new Headers(init?.headers).get('authorization'), 'Bearer signed-in-user-token');
    assert.equal(url.pathname, '/rest/v1/board_cards');
    if (init?.method === 'POST') {
      posts++; const payload = JSON.parse(String(init.body)); assert.equal(payload.user_id, user);
      await hold;
      rows.push({ ...payload, status: 'open', archived_at: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
      return Response.json({ id: payload.id }, { status: 201 });
    }
    assert.equal(url.searchParams.get('user_id'), `eq.${user}`);
    return Response.json(rows);
  });
  const save = createSaver(client); const payload = payloadFor({ ...freshDraft(), text: 'Desktop thought' }, user);
  const first = save(payload);
  await assert.rejects(save(payload), /already in progress/);
  release(); await first;
  const result = await client.from('board_cards').select('*').eq('user_id', user);
  assert.equal(posts, 1); assert.equal(result.data?.[0].title, 'Desktop thought');
  const board = filterCards(result.data as BoardCard[], { view: 'general', project: '', search: '', type: '', category: '', status: '', due: '' });
  assert.equal(board[0].id, payload.id);
});

test('lost response and safe retry use the same UUID without upserting or duplicating a card', async () => {
  const ids: string[] = []; let committed = false;
  const client = clientWith(async (input, init) => {
    if (init?.method === 'POST') {
      ids.push(JSON.parse(String(init.body)).id);
      if (!committed) { committed = true; return Response.json({ message: 'Response lost' }, { status: 504 }); }
      assert.ok(!new Headers(init.headers).get('prefer')?.includes('merge-duplicates'));
      return Response.json({ code: '23505', message: 'Duplicate' }, { status: 409 });
    }
    const url = new URL(String(input));
    assert.equal(url.searchParams.get('user_id'), `eq.${user}`);
    return Response.json({ id: ids[0] });
  });
  const disk = storage(); const draft = { ...freshDraft(), text: 'Only one card' };
  const payload = payloadFor(draft, user); writeDraft(disk, user, { ...draft, attempt: payload });
  await assert.rejects(createSaver(client)(payload), /could not confirm/i);
  const recovered = readDraft(disk, user);
  await createSaver(client)(payloadFor(recovered, user));
  assert.deepEqual(ids, [payload.id, payload.id]);
});

test('definite permission/project rejection lets a kept draft be corrected; failed save unlocks retries', async () => {
  const client = clientWith(async () => Response.json({ code: '23503', message: 'Project missing' }, { status: 409 }));
  const save = createSaver(client); const payload = payloadFor({ ...freshDraft(), text: 'Keep text', project }, user);
  await assert.rejects(save(payload), error => error instanceof SaveRejected && /project/i.test(error.message));
  await assert.rejects(save(payload), SaveRejected);
});

test('project choices are active and owner-scoped, paginate beyond 500, and report query failures', async () => {
  let calls = 0;
  const client = clientWith(async input => {
    const url = new URL(String(input));
    assert.equal(url.pathname, '/rest/v1/board_projects');
    assert.equal(url.searchParams.get('user_id'), `eq.${user}`);
    assert.equal(url.searchParams.get('archived_at'), 'is.null');
    calls++;
    if (calls === 1) return Response.json(Array.from({ length: 500 }, (_, i) => ({ id: `id-${i}`, name: `Project ${i}` })));
    assert.equal(url.searchParams.get('id'), 'gt.id-499'); return Response.json([{ id: project, name: 'Last project' }]);
  });
  assert.equal((await loadProjects(client, user)).length, 501);
  await assert.rejects(loadProjects(clientWith(async () => Response.json({ message: 'Offline' }, { status: 503 })), user), /Retry/);
});

test('desktop auth is memory-only and website/native capabilities are narrowly scoped', () => {
  assert.deepEqual(authOptions, { persistSession: false, autoRefreshToken: true, detectSessionInUrl: false });
  assert.equal(websiteUrl('https://example.com/anything?token=bad'), 'https://example.com/board');
  assert.equal(websiteUrl('http://localhost:3000'), 'http://localhost:3000/board');
  for (const url of ['file:///C:/', 'javascript:alert(1)', 'http://example.com', 'https://user:pass@example.com']) assert.throws(() => websiteUrl(url));
  const config = JSON.parse(readFileSync(new URL('../desktop/quick-capture/src-tauri/tauri.conf.json', import.meta.url), 'utf8'));
  assert.match(config.app.security.csp, /frame-src 'none'/);
  const capability = JSON.parse(readFileSync(new URL('../desktop/quick-capture/src-tauri/capabilities/capture.json', import.meta.url), 'utf8'));
  assert.deepEqual(capability.permissions, ['core:event:allow-listen', 'core:event:allow-unlisten']);
  assert.equal(capability.remote, undefined);
});

test('password sign-in uses HTTPS Supabase auth, keeps session in memory and signs out locally', async () => {
  let storageWrites = 0; const paths: string[] = [];
  const token = `${Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url')}.${Buffer.from(JSON.stringify({ sub: user, exp: Math.floor(Date.now()/1000)+3600 })).toString('base64url')}.fake-signature`;
  const client = createClient('https://test.supabase.co', 'public-test-key', {
    auth: { ...authOptions, storage: { getItem: () => null, setItem: () => { storageWrites++; }, removeItem: () => { storageWrites++; } } },
    global: { fetch: async (input, init) => {
      const url = new URL(String(input)); paths.push(url.pathname);
      assert.equal(url.protocol, 'https:');
      if (url.pathname.endsWith('/token')) {
        assert.equal(url.searchParams.get('grant_type'), 'password');
        assert.deepEqual(JSON.parse(String(init?.body)), { email: 'student@example.com', password: 'synthetic-password', gotrue_meta_security: {} });
        return Response.json({ access_token: token, refresh_token: 'synthetic-refresh', token_type: 'bearer', expires_in: 3600, user: { id: user, email: 'student@example.com' } });
      }
      assert.equal(url.pathname, '/auth/v1/logout'); assert.equal(url.searchParams.get('scope'), 'local');
      return new Response(null, { status: 204 });
    } },
  });
  try {
    const signed = await client.auth.signInWithPassword({ email: 'student@example.com', password: 'synthetic-password' });
    assert.equal(signed.error, null); assert.equal(signed.data.user?.id, user);
    assert.equal((await client.auth.getSession()).data.session?.user.id, user);
    await client.auth.signOut({ scope: 'local' });
    assert.equal((await client.auth.getSession()).data.session, null);
    assert.equal(storageWrites, 0); assert.equal(paths.length, 2);
  } finally { client.auth.stopAutoRefresh(); }
});
