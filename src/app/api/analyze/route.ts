import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { cvSchema, offerSchema } from "@/lib/schemas";
import { AnalysisError, analyzeOffer } from "@/lib/openai";
import { analyzeWithGemini } from "@/lib/gemini";
import { reconcileCvSources } from "@/lib/cv";
export const runtime = "nodejs";
export const maxDuration = 120;
function fail(error: string, status: number) { return NextResponse.json({ error }, { status, headers: { "Cache-Control": "no-store" } }); }
export async function POST(request: Request) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ") || !authorization.slice(7)) return fail("Sign in to analyze an offer.", 401);
  const provider = process.env.AI_PROVIDER || "openai";
  if (!["openai", "gemini"].includes(provider)) return fail("AI_PROVIDER must be openai or gemini.", 503);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL; const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY; const apiKey = provider === "gemini" ? process.env.GEMINI_API_KEY : process.env.OPENAI_API_KEY;
  if (apiKey === "YOUR_GEMINI_API_KEY") return fail("Add your GEMINI_API_KEY to .env.local and restart the app.", 503);
  if (!url || !key || !apiKey) return fail("Server configuration is incomplete. Check environment variables.", 503);
  const token = authorization.slice(7);
  try {
    const supabase = createClient(url, key, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return fail("Your session expired. Sign in again.", 401);
    if (!request.headers.get("content-type")?.includes("application/json")) return fail("Send a JSON request.", 415);
    const reader = request.body?.getReader(); if (!reader) return fail("Enter a job offer.", 400);
    const chunks: Uint8Array[] = []; let bytes = 0;
    while (true) { const { done, value } = await reader.read(); if (done) break; bytes += value.byteLength; if (bytes > 200000) { await reader.cancel(); return fail("The job offer is too large.", 413); } chunks.push(value); }
    let body: unknown; try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { return fail("Invalid JSON request.", 400); }
    const parsed = offerSchema.safeParse(body); if (!parsed.success) return fail(parsed.error.issues[0].message, 400);
    const { data: profile, error: profileError } = await supabase.from("profiles").select("cv_text").eq("user_id", user.id).maybeSingle();
    if (profileError) return fail("Could not load your CV. Check the database setup and try again.", 500);
    const cv = cvSchema.safeParse(profile?.cv_text); if (!cv.success) return fail("Save your CV on the Profile / CV page first.", 400);
    const offer = parsed.data; const generated = await (provider === "gemini" ? analyzeWithGemini : analyzeOffer)({ ...offer, cvText: cv.data }, apiKey);
    const analysis = { ...reconcileCvSources(generated, cv.data), masterCvText: cv.data, confirmedSkills: [] };
    const { data: application, error: saveError } = await supabase.from("applications").insert({ user_id: user.id, job_title: offer.jobTitle, company: offer.company, job_offer_text: offer.jobOfferText, ai_analysis: analysis, status: "saved", notes: "" }).select("id").single();
    if (saveError || !application) return fail("Analysis completed, but saving failed. Check the database setup before retrying.", 500);
    return NextResponse.json({ applicationId: application.id, ...analysis }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof AnalysisError) return fail(error.message, error.status);
    if (error instanceof Error && ["TimeoutError", "AbortError"].includes(error.name)) return fail("Analysis timed out. Please try again.", 504);
    return fail("Could not complete the analysis. Please try again.", 500);
  }
}
