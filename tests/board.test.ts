import test from 'node:test';
import assert from 'node:assert/strict';
import { cardInput, projectInput, solutionInput, filterCards, completionStatus, localDate, type BoardCard, type BoardFilters } from '../src/lib/board';
const filters: BoardFilters = { view: 'all', project: '', search: '', type: '', category: '', status: '', due: '' };
const project = '11111111-1111-4111-8111-111111111111';
function card(id: string, fields: Partial<BoardCard> = {}): BoardCard {
  return { id, user_id: 'user', title: 'A thought', body: '', type: 'note', category: '', project_id: null, due_date: null, status: 'open', archived_at: null, created_at: '2026-10-13', updated_at: '2026-10-13', ...fields };
}
test('quick capture requires only a title and trims whitespace', () => {
  assert.deepEqual(cardInput.parse({ title: '  Gym tomorrow  ' }), { title: 'Gym tomorrow', body: '', type: 'note', category: '', project_id: null, due_date: null });
  for (const input of [{ title: ' ' }, { title: 'a'.repeat(301) }, { title: 'X', due_date: '2026-02-30' }, { title: 'X', project_id: 'other' }, { title: 'X', user_id: 'spoof' }]) assert.equal(cardInput.safeParse(input).success, false);
  assert.equal(cardInput.safeParse({ title: 'X', due_date: '2028-02-29' }).success, true);
  assert.equal(projectInput.safeParse('  ').success, false);
  assert.equal(solutionInput.safeParse({ title: 'Try', outcome: 'maybe' }).success, false);
  assert.equal(solutionInput.parse({ title: 'Try a shorter workout' }).outcome, 'not_tried');
});
test('General, projects, Problems and Archive keep cards separate without losing them', () => {
  const cards = [card('general'), card('project', { project_id: project }), card('problem', { type: 'problem' }), card('resolved', { type: 'problem', status: 'resolved' }), card('archived', { archived_at: '2026-10-13' })];
  assert.equal(filterCards(cards, filters).length, 4);
  assert.deepEqual(filterCards(cards, { ...filters, view: 'general' }).map(card => card.id), ['general','problem','resolved']);
  assert.deepEqual(filterCards(cards, { ...filters, view: 'project', project }).map(card => card.id), ['project']);
  assert.deepEqual(filterCards(cards, { ...filters, view: 'problems', status: 'open' }).map(card => card.id), ['problem']);
  assert.deepEqual(filterCards(cards, { ...filters, view: 'archive' }).map(card => card.id), ['archived']);
});
test('Upcoming sorts dated open tasks and reminders, including overdue, without completed cards', () => {
  const cards = [card('later', { type: 'reminder', due_date: '2026-10-20' }), card('overdue', { type: 'task', due_date: '2026-10-10' }), card('done', { type: 'task', status: 'completed', due_date: '2026-10-10' }), card('undated', { type: 'reminder' }), card('note', { due_date: '2026-10-10' })];
  assert.deepEqual(filterCards(cards, { ...filters, view: 'upcoming' }, '2026-10-13').map(card => card.id), ['overdue','later']);
  assert.deepEqual(filterCards(cards, { ...filters, due: 'overdue', type: 'task' }, '2026-10-13').map(card => card.id), ['overdue']);
});
test('search combines category, project, type, status and date filters', () => {
  const cards = [card('match', { title: 'Study plan', body: 'Review algebra', category: 'Studies', type: 'task', project_id: project, due_date: '2026-10-13' }), card('other', { title: 'Study plan', category: 'Gym' })];
  assert.deepEqual(filterCards(cards, { ...filters, search: ' ALGEBRA ', category: 'Studies', project, type: 'task', status: 'open', due: 'today' }, '2026-10-13').map(card => card.id), ['match']);
  assert.equal(filterCards(cards, { ...filters, due: 'undated' }).length, 1);
  assert.equal(filterCards(cards, { ...filters, due: 'future' }, '2026-10-12').length, 1);
});
test('completion resolves problems, completes tasks, and can reopen either', () => {
  assert.equal(completionStatus(card('task', { type: 'task' })), 'completed');
  assert.equal(completionStatus(card('problem', { type: 'problem' })), 'resolved');
  assert.equal(completionStatus(card('resolved', { type: 'problem', status: 'resolved' })), 'open');
  assert.equal(completionStatus(card('done', { status: 'completed' })), 'open');
  assert.equal(localDate(new Date(2026, 9, 13, 23, 59)), '2026-10-13');
});
