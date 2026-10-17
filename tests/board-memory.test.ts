import test from 'node:test';
import assert from 'node:assert/strict';
import { readBoardMemory, writeBoardMemory, emptyBoardMemory, changeBoardView, type BoardMemory } from '../src/lib/board-memory';
import { cardInput } from '../src/lib/board';
const project = '11111111-1111-4111-8111-111111111111';
function storage() {
  const values = new Map<string, string>();
  return { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
}
function saved(): BoardMemory {
  return { ...emptyBoardMemory(), filters: { ...emptyBoardMemory().filters, view: 'project', project, search: 'Exam', status: 'open', due: 'today' }, filtersOpen: true, projectsOpen: true, captureOpen: true, scrollY: 840, draft: { title: 'Plan a study session', type: 'task', category: 'Studies', body: 'Review chapter 3', project_id: project, due_date: '2026-10-20', format: 'text', url: '' } };
}
test('returning to Board restores the project, filters, panel state, scroll and complete draft', () => {
  const session = storage(); const memory = saved();
  assert.equal(writeBoardMemory(session, 'user-a', memory), true);
  assert.deepEqual(readBoardMemory(session, 'user-a'), memory);
  assert.deepEqual(readBoardMemory(session, 'user-b'), emptyBoardMemory());
});
test('switching views resets navigation filters while preserving all unsaved capture data', () => {
  const memory = saved(); const next = changeBoardView(memory, 'problems');
  assert.deepEqual(next.draft, memory.draft);
  assert.equal(next.draft?.project_id, project);
  assert.equal(next.draft?.type, 'task');
  assert.equal(next.filters.view, 'problems');
  assert.equal(next.filters.search, ''); assert.equal(next.filters.project, '');
  assert.equal(next.scrollY, 0); assert.equal(next.filtersOpen, false);
  assert.equal(memory.filters.view, 'project');
});
test('incomplete drafts survive navigation, but cannot be submitted without a title', () => {
  const session = storage(); const memory = saved(); memory.draft!.title = '';
  assert.equal(writeBoardMemory(session, 'user-a', memory), true);
  const restored = readBoardMemory(session, 'user-a');
  assert.equal(restored.draft?.body, 'Review chapter 3');
  assert.equal(cardInput.safeParse(restored.draft).success, false);
  restored.draft!.title = 'Study';
  assert.equal(cardInput.safeParse(restored.draft).success, true);
});
test('successful capture can clear the draft without clearing the view and filters', () => {
  const session = storage(); const memory = saved();
  writeBoardMemory(session, 'user-a', { ...memory, draft: null });
  const restored = readBoardMemory(session, 'user-a');
  assert.equal(restored.draft, null);
  assert.deepEqual(restored.filters, memory.filters);
});
test('corrupt storage, invalid filters and unavailable storage do not break Board', () => {
  const session = storage(); session.setItem('jobapply:board:user-a', '{broken');
  assert.deepEqual(readBoardMemory(session, 'user-a'), emptyBoardMemory());
  session.setItem('jobapply:board:user-a', JSON.stringify({ ...saved(), scrollY: -1 }));
  assert.deepEqual(readBoardMemory(session, 'user-a'), emptyBoardMemory());
  assert.equal(writeBoardMemory(session, 'user-a', { ...saved(), filters: { ...saved().filters, type: 'invalid' } }), false);
  const unavailable = { getItem() { throw new Error('Blocked'); }, setItem() { throw new Error('Full'); } };
  assert.deepEqual(readBoardMemory(unavailable, 'user-a'), emptyBoardMemory());
  assert.equal(writeBoardMemory(unavailable, 'user-a', saved()), false);
});
