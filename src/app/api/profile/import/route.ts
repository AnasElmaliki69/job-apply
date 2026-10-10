import { readFile } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { cvSchema } from "@/lib/schemas";
export const runtime = "nodejs";
function result(body: object, status: number) { return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } }); }
export async function POST(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer /, "");
  if (!token) return result({ error: "Sign in first." }, 401);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const owner = process.env.MASTER_CV_OWNER_EMAIL?.trim().toLowerCase();
  if (!url || !key || !owner) return result({ error: "Your provided CV is not configured for import." }, 503);
  try {
    const client = createClient(url, key, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false } });
    const { data: { user }, error } = await client.auth.getUser(token);
    if (error || !user) return result({ error: "Your session expired. Sign in again." }, 401);
    if (user.email?.toLowerCase() !== owner || !user.email_confirmed_at) return result({ error: "The provided master CV belongs to a different account, or your email is not confirmed." }, 403);
    const { data: profile, error: loadError } = await client.from("profiles").select("user_id").eq("user_id", user.id).maybeSingle();
    if (loadError) return result({ error: "Could not check your profile." }, 500);
    if (profile) return result({ error: "You already have a master CV. It has not been overwritten." }, 409);
    const cv = cvSchema.parse(await readFile(path.join(process.cwd(), "private", "master-cv.txt"), "utf8"));
    const { error: saveError } = await client.from("profiles").insert({ user_id: user.id, cv_text: cv });
    if (saveError) return result({ error: "Could not import your CV. Check database setup or reload if already imported." }, 500);
    return result({ cvText: cv }, 200);
  } catch { return result({ error: "Could not load the provided CV file." }, 500); }
}
