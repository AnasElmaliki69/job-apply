import test from "node:test";
import assert from "node:assert/strict";
import { analyzeWithGemini, parseGeminiAnalysis } from "../src/lib/gemini";
import { POST } from "../src/app/api/analyze/route";
const analysis = { matchScore: 75, summary: "Profil adapté.", missingSkills: [], keywordsToAdd: [], improvedCvBullets: [], coverLetter: "Madame, Monsieur", interviewQuestions: [], suggestedSkills: [], tailoredCv: [{ heading: "Profil", original: "CV", revised: "Expérience pertinente.", reason: "Met en valeur le profil." }] };
const response = { candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify(analysis) }] } }] };
test("Gemini JSON becomes the same validated application analysis", () => {
  assert.deepEqual(parseGeminiAnalysis(response), analysis);
  assert.throws(() => parseGeminiAnalysis({ candidates: [{ finishReason: "MAX_TOKENS" }] }));
  assert.throws(() => parseGeminiAnalysis({ promptFeedback: { blockReason: "SAFETY" } }));
});
test("Gemini key stays in headers and requests include French instructions and schema", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    assert.doesNotMatch(String(input), /fake-secret/);
    assert.equal(new Headers(init?.headers).get("x-goog-api-key"), "fake-secret");
    const body = JSON.parse(String(init?.body));
    assert.match(body.systemInstruction.parts[0].text, /French/);
    assert.equal(body.generationConfig.responseMimeType, "application/json");
    assert.ok(body.generationConfig.responseJsonSchema.required.includes("tailoredCv"));
    return Response.json(response);
  };
  try { assert.deepEqual(await analyzeWithGemini({ cvText: "CV", jobTitle: "Developer", company: "Acme", jobOfferText: "Offer" }, "fake-secret"), analysis); }
  finally { globalThis.fetch = original; }
});
test("Gemini API limit is reported without leaking the key", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ error: { message: "fake-secret" } }, { status: 429 });
  try { await assert.rejects(() => analyzeWithGemini({ cvText: "CV", jobTitle: "Developer", company: "Acme", jobOfferText: "Offer" }, "fake-secret"), /Gemini quota or rate limit/); }
  finally { globalThis.fetch = original; }
});
test("Gemini provider saves an owner-scoped application and master CV snapshot", async () => {
  const names = ["AI_PROVIDER", "GEMINI_API_KEY", "NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"] as const;
  const previous = names.map(name => process.env[name]); const original = globalThis.fetch;
  process.env.AI_PROVIDER = "gemini"; process.env.GEMINI_API_KEY = "fake-secret";
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://test.supabase.co"; process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "fake-public";
  const userId = "11111111-1111-4111-8111-111111111111";
  let saved = false;
  globalThis.fetch = async (input, init) => {
    const url = String(input);
    if (url.includes("/auth/v1/user")) return Response.json({ id: userId });
    if (url.includes("/rest/v1/profiles")) return Response.json([{ cv_text: "CV" }]);
    if (url.includes("generativelanguage.googleapis.com")) return Response.json(response);
    if (url.includes("/rest/v1/applications")) {
      const body = JSON.parse(String(init?.body));
      assert.equal(body.user_id, userId); assert.equal(body.ai_analysis.masterCvText, "CV");
      assert.deepEqual(body.ai_analysis.confirmedSkills, []); saved = true;
      return Response.json({ id: "application-id" });
    }
    throw new Error("Unexpected external call");
  };
  try {
    const result = await POST(new Request("http://localhost/api/analyze", { method: "POST", headers: { Authorization: "Bearer user-token", "Content-Type": "application/json" }, body: JSON.stringify({ jobTitle: "Developer", company: "Acme", jobOfferText: "Offer" }) }));
    assert.equal(result.status, 200); assert.equal(saved, true);
    assert.equal((await result.json()).applicationId, "application-id");
  } finally { globalThis.fetch = original; names.forEach((name, i) => { if (previous[i] === undefined) delete process.env[name]; else process.env[name] = previous[i]; }); }
});
