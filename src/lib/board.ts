import { z } from 'zod';

export const cardTypes = ['note', 'idea', 'task', 'reminder', 'problem', 'solution'] as const;
export const outcomes = ['not_tried', 'worked', 'partly_worked', 'did_not_work'] as const;
export const outcomeLabels = { not_tried: 'Not tried yet', worked: 'Worked', partly_worked: 'Partly worked', did_not_work: 'Did not work' };
export const typeColors: Record<typeof cardTypes[number], string> = {
  note: 'bg-slate-100 text-slate-700', idea: 'bg-violet-50 text-violet-700', task: 'bg-blue-50 text-blue-700',
  reminder: 'bg-amber-50 text-amber-800', problem: 'bg-rose-50 text-rose-700', solution: 'bg-emerald-50 text-emerald-700',
};
// Gentle surfaces keep type labels readable without relying on color alone.
export const cardSurfaces: Record<typeof cardTypes[number], string> = {
  note: 'border-slate-200 bg-slate-50/80', idea: 'border-violet-200/70 bg-violet-50/65',
  task: 'border-sky-200/70 bg-sky-50/65', reminder: 'border-amber-200/70 bg-amber-50/65',
  problem: 'border-rose-200/70 bg-rose-50/65', solution: 'border-emerald-200/70 bg-emerald-50/65',
};
export const cardFormats = ['text','link','code','decision'] as const;
export const formatLabels = { text: 'Text', link: 'Link', code: 'Code snippet', decision: 'Decision' };
export const safeWebUrl = z.string().trim().max(2000).refine(value => {
  if (!value) return true;
  try { const url = new URL(value); return ['http:','https:'].includes(url.protocol) && !url.username && !url.password; } catch { return false; }
}, 'Use a full http:// or https:// URL without embedded credentials.');
export const projectDetailsInput = z.object({
  name: z.string().trim().min(1, 'Enter a project name.').max(100),
  goal: z.string().trim().max(5000).default(''), description: z.string().trim().max(10000).default(''),
  repository_url: safeWebUrl.default(''), source_links: z.array(safeWebUrl.refine(value => !!value, 'Enter a URL or remove the empty line.')).max(20).default([]),
}).strict();
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
  format: z.enum(cardFormats).default('text'), url: safeWebUrl.default(''),
}).strict();
export const projectInput = z.string().trim().min(1, 'Enter a project name.').max(100);
export const solutionInput = z.object({
  title: z.string().trim().min(1, 'Enter a solution.').max(300),
  tried: z.string().max(10000).default(''), result: z.string().max(10000).default(''),
  outcome: z.enum(outcomes).default('not_tried'),
}).strict();
export type BoardCard = Omit<z.infer<typeof cardInput>, 'format' | 'url'> & { format?: typeof cardFormats[number]; url?: string; id: string; user_id: string; status: 'open' | 'completed' | 'resolved'; archived_at: string | null; created_at: string; updated_at: string };
export type BoardProject = { id: string; user_id: string; name: string; goal?: string; description?: string; repository_url?: string; source_links?: string[]; archived_at: string | null; created_at: string; updated_at: string };
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
    return !search || `${card.title} ${card.body} ${card.category} ${card.url ?? ''} ${card.format === 'decision' ? 'decision' : ''}`.toLocaleLowerCase().includes(search);
  }).sort((a, b) => filters.view === 'upcoming'
    ? (a.due_date ?? '').localeCompare(b.due_date ?? '') || b.created_at.localeCompare(a.created_at)
    : b.created_at.localeCompare(a.created_at));
}
export function projectProgress(cards: BoardCard[], projectId: string) {
  const tasks = cards.filter(card => card.project_id === projectId && card.type === 'task' && !card.archived_at);
  const completed = tasks.filter(card => card.status === 'completed').length;
  return { total: tasks.length, completed, percent: tasks.length ? Math.round(completed / tasks.length * 100) : 0 };
}
export function projectCardGroups(cards: BoardCard[], projectId: string) {
  const active = cards.filter(card => card.project_id === projectId && !card.archived_at);
  return {
    tasks: active.filter(card => card.type === 'task'),
    resources: active.filter(card => card.type !== 'task' && ['link','code'].includes(card.format ?? 'text')),
    decisions: active.filter(card => card.type !== 'task' && card.format === 'decision'),
    notes: active.filter(card => card.type !== 'task' && !['link','code','decision'].includes(card.format ?? 'text')),
  };
}
