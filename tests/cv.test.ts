import test from "node:test";
import assert from "node:assert/strict";
import { analysisSchema, generatedAnalysisSchema } from "../src/lib/schemas";
import { cvText, confirmedSkillsFor, reconcileCvSources } from "../src/lib/cv";
const base = { matchScore: 70, summary: "Profil adapté.", missingSkills: ["Excel"], keywordsToAdd: [], improvedCvBullets: [], coverLetter: "Madame, Monsieur,", interviewQuestions: [], tailoredCv: [{ heading: "Expérience", original: "Sales", revised: "Expérience en vente", reason: "Met en valeur la vente." }], suggestedSkills: ["Excel"], masterCvText: "Sales", confirmedSkills: [] };
test("PDF wrapping, punctuation and ligatures are reconciled to authentic source text", () => {
  const source = "Développement  web\nà Lyon — l’expérience et le proﬁl.";
  const result = reconcileCvSources({ ...base, tailoredCv: [{ ...base.tailoredCv[0], original: "Développement web à Lyon - l'expérience et le profil." }] }, source);
  assert.equal(result.tailoredCv?.[0].original, source);
  assert.equal(result.tailoredCv?.[0].comparisonUnavailable, false);
});
test("invented originals are never shown as authentic and do not block generation", () => {
  const original = JSON.stringify(base);
  const result = reconcileCvSources({ ...base, tailoredCv: [{ ...base.tailoredCv[0], original: "Expert in Kubernetes" }] }, "Sales");
  assert.equal(result.tailoredCv?.[0].original, "");
  assert.equal(result.tailoredCv?.[0].comparisonUnavailable, true);
  assert.equal(result.tailoredCv?.[0].revised, base.tailoredCv[0].revised);
  assert.equal(JSON.stringify(base), original);
});
test("changed dates, numbers and skill symbols do not count as source matches", () => {
  for (const original of ["2025", "92 %", "C++"]) {
    const result = reconcileCvSources({ ...base, tailoredCv: [{ ...base.tailoredCv[0], original }] }, "2026 58 % C#");
    assert.equal(result.tailoredCv?.[0].comparisonUnavailable, true);
  }
});
test("unconfirmed and unknown skills never enter the exported CV", () => {
  assert.doesNotMatch(cvText(base), /Excel/);
  assert.deepEqual(confirmedSkillsFor(base, ["Excel", "Excel", "Invented"]), ["Excel"]);
  assert.match(cvText(base, ["Excel"]), /Compétences complémentaires confirmées\nExcel/);
  assert.doesNotMatch(cvText(base, ["Unknown"]), /Unknown/);
});
test("CV export does not change the master snapshot", () => {
  const before = JSON.stringify(base); cvText(base, ["Excel"]);
  assert.equal(JSON.stringify(base), before);
});
test("old applications remain readable but new AI outputs require a tailored CV", () => {
  const { tailoredCv, suggestedSkills, masterCvText, confirmedSkills, ...legacy } = base;
  assert.equal(analysisSchema.safeParse(legacy).success, true);
  assert.equal(generatedAnalysisSchema.safeParse(legacy).success, false);
  assert.equal(generatedAnalysisSchema.safeParse({ ...legacy, tailoredCv, suggestedSkills }).success, true);
});
