import { z } from 'zod';

export const subjectSchema = z.object({ name: z.string().trim().min(1, 'Enter a subject name.').max(100) });
export const materialSchema = z.object({ subject_id: z.uuid(), topic: z.string().trim().min(1, 'Enter a topic.').max(200), content: z.string().trim().min(50, 'Paste at least 50 characters of study material.').max(20000, 'Keep material under 20,000 characters.') });
export const generateQuizSchema = z.object({ materialId: z.uuid(), count: z.union([z.literal(5), z.literal(10)]) }).strict();
const text = (max: number) => z.string().trim().min(1).max(max);
export const questionSchema = z.object({
  prompt: text(1000), options: z.array(text(500)).length(4), correctIndex: z.number().int().min(0).max(3),
  explanation: text(1500), reviewTopic: text(200), evidence: text(1200),
}).strict().superRefine((question, ctx) => {
  if (new Set(question.options.map(option => option.toLocaleLowerCase())).size !== 4) ctx.addIssue({ code: 'custom', message: 'Question options must be distinct.' });
});
export const generatedQuizSchema = z.object({ questions: z.array(questionSchema).min(5).max(10) }).strict();
export type StudyQuestion = z.infer<typeof questionSchema>;
export type PublicQuestion = Pick<StudyQuestion, 'prompt' | 'options'>;
export type StudySubject = { id: string; name: string };
export type StudyMaterial = { id: string; subject_id: string; topic: string; content: string; created_at: string };
export type StudyQuiz = { id: string; material_id: string; title: string; question_count: number; created_at: string };
export type QuestionResult = StudyQuestion & { selected: number | null; correct: boolean };
export type StudyAttempt = { id: string; quiz_id: string; score: number; total: number; results: QuestionResult[]; created_at: string };
export function reviewQuestions(attempts: StudyAttempt[]) {
  // Only the latest attempt of each quiz counts: a successful retry clears old mistakes.
  const latest = new Map<string, StudyAttempt>();
  for (const attempt of attempts) if (!latest.has(attempt.quiz_id) || attempt.created_at > latest.get(attempt.quiz_id)!.created_at) latest.set(attempt.quiz_id, attempt);
  return [...latest.values()].flatMap(attempt => attempt.results.flatMap((question, index) => question.correct ? [] : [{ quizId: attempt.quiz_id, index, question }]));
}
export class StudyError extends Error { constructor(message: string, public status = 502) { super(message); } }
