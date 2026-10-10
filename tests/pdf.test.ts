import test from "node:test";
import assert from "node:assert/strict";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { buildCvPdf, printableText, cvParagraphs } from "../src/lib/cv-pdf";
import { POST } from "../src/app/api/applications/[id]/pdf/route";
const analysis = { matchScore: 80, summary: "Profil adapté.", missingSkills: [], keywordsToAdd: [], improvedCvBullets: [], coverLetter: "Madame, Monsieur", interviewQuestions: [], suggestedSkills: ["Excel"], confirmedSkills: [], tailoredCv: [{ heading: "Identité", original: "", revised: "Camille Exemple\nDéveloppeur React\nLyon · camille@example.com", reason: "Présentation" }, { heading: "Expérience", original: "", revised: "Développement d’interfaces accessibles en français.", reason: "Pertinence" }] };
test("Word-style titles, dates, descriptions and bullets retain their hierarchy", () => {
  const items = cvParagraphs("Expérience professionnelle", "Stagiaire — Société\tMai – Août 2026 · 4 mois\nAudit du système informatique\n• Analyse des logs\nRésultats : incidents réduits");
  assert.equal(items[0].text, "Stagiaire — Société");
  assert.equal(items[0].date, "Mai – Août 2026 · 4 mois");
  assert.equal(items[0].title, true);
  assert.equal(items[1].italic, true);
  assert.equal(items[2].bullet, true);
  assert.equal(items[3].label, "Résultats : ");
  assert.equal(cvParagraphs("Formation", "Bachelor — École 2023 – 2026")[0].title, true);
  assert.equal(cvParagraphs("Profil", "Analyse de 2026 systèmes")[0].title, false);
});
test("renders a valid A4 PDF without modifying the master analysis", async () => {
  const original = JSON.stringify(analysis); const bytes = await buildCvPdf(analysis);
  assert.equal(Buffer.from(bytes).subarray(0, 5).toString(), "%PDF-");
  const doc = await PDFDocument.load(bytes);
  assert.equal(doc.getPageCount(), 1);
  assert.equal(doc.getPage(0).getWidth(), 595.28);
  assert.equal(JSON.stringify(analysis), original);
});
test("long French sections paginate and long words wrap without failing", async () => {
  const bytes = await buildCvPdf({ ...analysis, tailoredCv: Array.from({ length: 3 }, () => ({ ...analysis.tailoredCv[1], revised: ("Compétences en développement et sécurité. ".repeat(100)) + "a".repeat(300) })) });
  assert.ok((await PDFDocument.load(bytes)).getPageCount() > 1);
});
test("French accents survive and arrows are printable", async () => {
  const doc = await PDFDocument.create(); const font = await doc.embedFont(StandardFonts.Helvetica);
  assert.equal(printableText("Sécurité, français, cœur : 58 % → 92 %", font), "Sécurité, français, cœur : 58 % -> 92 %");
});
test("PDF endpoint requires authentication", async () => {
  const result = await POST(new Request("http://localhost/api/applications/id/pdf", { method: "POST" }), { params: Promise.resolve({ id: "id" }) });
  assert.equal(result.status, 401);
});
