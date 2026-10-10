import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { analysisSchema } from "@/lib/schemas";
import { buildCvPdf } from "@/lib/cv-pdf";
export const runtime = "nodejs";
const headers = { "Cache-Control": "no-store" };
function fail(error: string, status: number) { return NextResponse.json({ error }, { status, headers }); }
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ") || !authorization.slice(7)) return fail("Sign in to download your CV.", 401);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return fail("Configure Supabase before downloading.", 503);
  try {
    const token = authorization.slice(7);
    const client = createClient(url, key, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false, autoRefreshToken: false } });
    const { data: { user }, error: authError } = await client.auth.getUser(token);
    if (authError || !user) return fail("Your session expired. Sign in again.", 401);
    const { id } = await params;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return fail("Application not found.", 404);
    const { data, error } = await client.from("applications").select("ai_analysis,company").eq("id", id).eq("user_id", user.id).maybeSingle();
    if (error) return fail("Could not load this application.", 500);
    if (!data) return fail("Application not found.", 404);
    const parsed = analysisSchema.safeParse(data.ai_analysis);
    if (!parsed.success || !parsed.data.tailoredCv) return fail("Analyze this offer again to generate a tailored PDF CV.", 409);
    const bytes = await buildCvPdf(parsed.data);
    const filename = `CV-fr-${String(data.company).replace(/[^a-zA-Z0-9_-]/g, "-").slice(0, 80)}.pdf`;
    return new Response(Buffer.from(bytes), { headers: { ...headers, "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${filename}"` } });
  } catch { return fail("Could not generate your PDF. Please try again.", 500); }
}
