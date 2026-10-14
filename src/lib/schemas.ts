import { z } from "zod";

export const statuses = ["saved", "applied", "interview", "rejected", "accepted"] as const;
export type Status = typeof statuses[number];
const items = z.array(z.string().trim().min(1).max(2000)).max(30);
export const cvBlockSchema = z.object({
  heading: z.string().trim().min(1).max(200),
  original: z.string().max(6000),
  revised: z.string().trim().min(1).max(6000),
  reason: z.string().trim().min(1).max(1000),
  comparisonUnavailable: z.boolean().optional()
}).strict();
export const analysisSchema = z.object({
  matchScore: z.number().int().min(0).max(100),
  summary: z.string().trim().min(1).max(4000),
  missingSkills: items, keywordsToAdd: items, improvedCvBullets: items,
  coverLetter: z.string().trim().min(1).max(12000), interviewQuestions: items,
  tailoredCv: z.array(cvBlockSchema).min(1).max(30).optional(),
  suggestedSkills: items.optional(),
  masterCvText: z.string().max(30000).optional(),
  confirmedSkills: items.optional()
}).strict();
export const generatedAnalysisSchema = analysisSchema.omit({ masterCvText: true, confirmedSkills: true }).extend({
  tailoredCv: z.array(cvBlockSchema.omit({ comparisonUnavailable: true })).min(1).max(30), suggestedSkills: items
});
export const offerSchema = z.object({
  jobTitle: z.string().trim().min(1, "Enter a job title.").max(200),
  company: z.string().trim().min(1, "Enter a company.").max(200),
  jobOfferText: z.string().trim().min(1, "Paste the job offer.").max(30000)
}).strict();
export const analysisRequestSchema = offerSchema.extend({ savedOfferId: z.uuid().optional() });
export const cvSchema = z.string().trim().min(1, "Paste your CV before saving.").max(30000);
export const progressSchema = z.object({ status: z.enum(statuses), notes: z.string().max(10000) });
export type Analysis = z.infer<typeof analysisSchema>;
export type Application = {
  id: string; user_id: string; job_title: string; company: string;
  job_offer_text: string; ai_analysis: Analysis; status: Status; notes: string;
  created_at: string; updated_at: string; source_offer_id?: string | null;
};
export function message(error: unknown): string {
  if (error && typeof error === "object" && "message" in error && typeof error.message === "string") return error.message;
  return "Something went wrong. Please try again.";
}
