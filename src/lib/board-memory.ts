import { z } from 'zod';
import { cardInput, cardTypes, type BoardFilters } from './board';

export const blankBoardFilters: BoardFilters = { view: 'all', project: '', search: '', type: '', category: '', status: '', due: '' };
export const captureDraftSchema = cardInput.extend({ title: z.string().max(300) });
export type CaptureDraft = z.infer<typeof captureDraftSchema>;
const memorySchema = z.object({
  filters: z.object({
    view: z.enum(['all','general','project','problems','upcoming','archive']),
    project: z.union([z.uuid(), z.literal('')]), search: z.string().max(1000),
    type: z.union([z.enum(cardTypes), z.literal('')]), category: z.string().max(100),
    status: z.enum(['','open','completed','resolved']), due: z.enum(['','undated','today','overdue','future']),
  }),
  filtersOpen: z.boolean(), projectsOpen: z.boolean(), captureOpen: z.boolean(),
  draft: captureDraftSchema.nullable(), scrollY: z.number().finite().min(0),
});
export type BoardMemory = Omit<z.infer<typeof memorySchema>, 'filters'> & { filters: BoardFilters };
type MemoryStorage = Pick<Storage, 'getItem' | 'setItem'>;
export function emptyBoardMemory(): BoardMemory {
  return { filters: { ...blankBoardFilters }, filtersOpen: false, projectsOpen: false, captureOpen: false, draft: null, scrollY: 0 };
}
export function readBoardMemory(storage: MemoryStorage, userId: string): BoardMemory {
  try {
    const raw = storage.getItem(`jobapply:board:${userId}`);
    if (!raw) return emptyBoardMemory();
    const parsed = memorySchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : emptyBoardMemory();
  } catch { return emptyBoardMemory(); }
}
export function writeBoardMemory(storage: MemoryStorage, userId: string, memory: BoardMemory): boolean {
  try {
    storage.setItem(`jobapply:board:${userId}`, JSON.stringify(memorySchema.parse(memory)));
    return true;
  } catch { return false; }
}
export function changeBoardView(memory: BoardMemory, view: BoardFilters['view'], project = ''): BoardMemory {
  return { ...memory, filters: { ...blankBoardFilters, view, project }, filtersOpen: false, scrollY: 0 };
}
