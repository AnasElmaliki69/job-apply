import test from "node:test";
import assert from "node:assert/strict";
import { analysisSchema, offerSchema, cvSchema, progressSchema } from "../src/lib/schemas";
import { parseAnalysis, AnalysisError, analyzeOffer } from "../src/lib/openai";
const valid = { tailoredCv: [{ heading: "Expérience", original: "Built React interfaces.", revised: "Développement d’interfaces React.", reason: "Met en valeur React." }], suggestedSkills: ["GraphQL"], matchScore: 76, summary: "Relevant frontend experience.", missingSkills: ["GraphQL"], keywordsToAdd: ["React"], improvedCvBullets: ["Built React interfaces."], coverLetter: "Dear hiring team, I am interested in this role.", interviewQuestions: ["How do you test components?"] };
test("distinguishes API quota exhaustion from temporary rate limits", async () => {
  const original = globalThis.fetch;
  try {
    for (const [code, expected] of [["insufficient_quota", /insufficient quota.*billing/], ["rate_limit_exceeded", /rate limit/]] as const) {
      globalThis.fetch = async () => Response.json({ error: { code } }, { status: 429 });
      await assert.rejects(() => analyzeOffer({ cvText: "CV", company: "Acme", jobTitle: "Developer", jobOfferText: "Offer" }, "fake-test-key"), (error: unknown) => error instanceof AnalysisError && error.status === 429 && expected.test(error.message));
    }
  } finally { globalThis.fetch = original; }
});
test("rejects empty and oversized CV and offer fields", () => {
  assert.equal(cvSchema.safeParse("  ").success, false);
  assert.equal(cvSchema.safeParse("a".repeat(30001)).success, false);
  assert.equal(offerSchema.safeParse({ jobTitle: " ", company: "Acme", jobOfferText: "Offer" }).success, false);
  assert.equal(offerSchema.safeParse({ jobTitle: "Developer", company: "Acme", jobOfferText: "\n" }).success, false);
});
test("score must be an integer from zero to one hundred", () => {
  for (const matchScore of [-1, 101, 1.5, "76"]) assert.equal(analysisSchema.safeParse({ ...valid, matchScore }).success, false);
  for (const matchScore of [0, 100]) assert.equal(analysisSchema.safeParse({ ...valid, matchScore }).success, true);
});
test("rejects invalid statuses and oversized notes", () => {
  assert.equal(progressSchema.safeParse({ status: "unknown", notes: "" }).success, false);
  assert.equal(progressSchema.safeParse({ status: "applied", notes: "a".repeat(10001) }).success, false);
});
test("accepts a completed structured analysis", () => {
  assert.deepEqual(parseAnalysis({ status: "completed", output: [{ content: [{ type: "output_text", text: JSON.stringify(valid) }] }] }), valid);
});
test("rejects refusals, truncation, malformed JSON, and missing fields", () => {
  for (const result of [
    { status: "incomplete", output: [] },
    { status: "completed", output: [{ content: [{ type: "refusal" }] }] },
    { status: "completed", output: [{ content: [{ type: "output_text", text: "not json" }] }] },
    { status: "completed", output: [{ content: [{ type: "output_text", text: '{"matchScore":76}' }] }] }
  ]) assert.throws(() => parseAnalysis(result), AnalysisError);
});
