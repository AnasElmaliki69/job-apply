import { z } from 'zod';

export const cardTypes = ['note', 'idea', 'task', 'reminder', 'problem', 'solution'] as const;
export const outcomes = ['not_tried', 'worked', 'partly_worked', 'did_not_work'] as const;
export const outcomeLabels = { not_tried: 'Not tried yet', worked: 'Worked', partly_worked: 'Partly worked', did_not_work: 'Did not work' };
export const typeColors: Record<typeof cardTypes[number], string> = {
  note: 'bg-slate-100 text-slate-700', idea: 'bg-violet-50 text-violet-700', task: 'bg-blue-50 text-blue-700',
  reminder: 'bg-amber-50 text-amber-800', problem: 'bg-rose-50 text-rose-700', solution: 'bg-emerald-50 text-emerald-700',
};
export function localDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
const dueDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const parsed = new Date(`${value}T12:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, 'Choose a valid date.').nullable();
export const cardInput = z.object({
  title: z.string().trim().min(1, 'Enter a title or a short note.').max(300),
  body: z.string().max(10000).default(''),
  type: z.enum(cardTypes).default('note'), category: z.string().trim().max(100).default(''),
  project_id: z.uuid().nullable().default(null), due_date: dueDate.default(null),
}).strict();
export const projectInput = z.string().trim().min(1, 'Enter a project name.').max(100);
export const solutionInput = z.object({
  title: z.string().trim().min(1, 'Enter a solution.').max(300),
  tried: z.string().max(10000).default(''), result: z.string().max(10000).default(''),
  outcome: z.enum(outcomes).default('not_tried'),
}).strict();
export type BoardCard = z.infer<typeof cardInput> & { id: string; user_id: string; status: 'open' | 'completed' | 'resolved'; archived_at: string | null; created_at: string; updated_at: string };
export type BoardProject = { id: string; user_id: string; name: string; archived_at: string | null; created_at: string; updated_at: string };
export type BoardSolution = z.infer<typeof solutionInput> & { id: string; user_id: string; problem_id: string; archived_at: string | null; created_at: string; updated_at: string };
export type BoardFilters = { view: 'all' | 'general' | 'project' | 'problems' | 'upcoming' | 'archive'; project: string; search: string; type: string; category: string; status: string; due: string };
export function completionStatus(card: Pick<BoardCard, 'type' | 'status'>): BoardCard['status'] {
  return card.status !== 'open' ? 'open' : card.type === 'problem' ? 'resolved' : 'completed';
}
export function filterCards(cards: BoardCard[], filters: BoardFilters, today = localDate()) {
  const search = filters.search.trim().toLocaleLowerCase();
  return cards.filter(card => {
    if ((filters.view === 'archive') !== !!card.archived_at) return false;
    if (filters.view === 'general' && card.project_id !== null) return false;
    if ((filters.view === 'project' || filters.project) && card.project_id !== filters.project) return false;
    if (filters.view === 'problems' && card.type !== 'problem') return false;
    // Include overdue items so unfinished reminders cannot disappear.
    if (filters.view === 'upcoming' && (!card.due_date || card.status !== 'open' || !['task','reminder'].includes(card.type))) return false;
    if (filters.type && card.type !== filters.type) return false;
    if (filters.category && card.category !== filters.category) return false;
    if (filters.status && card.status !== filters.status) return false;
    if (filters.due === 'undated' && card.due_date !== null) return false;
    if (filters.due === 'today' && card.due_date !== today) return false;
    if (filters.due === 'overdue' && (!card.due_date || card.due_date >= today || card.status !== 'open')) return false;
    if (filters.due === 'future' && (!card.due_date || card.due_date <= today)) return false;
    return !search || `${card.title} ${card.body} ${card.category}`.toLocaleLowerCase().includes(search);
  }).sort((a, b) => filters.view === 'upcoming'
    ? (a.due_date ?? '').localeCompare(b.due_date ?? '') || b.created_at.localeCompare(a.created_at)
    : b.created_at.localeCompare(a.created_at));
}
