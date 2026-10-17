import { createClient } from '@supabase/supabase-js';
import { searchSchema } from '@/lib/explore';
import { ListingsError, searchAdzuna } from '@/lib/adzuna';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
function reply(body: object, status = 200) { return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } }); }
export async function GET(request: Request) {
  const authorization = request.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ') || !authorization.slice(7)) return reply({ error: 'Sign in to explore offers.' }, 401);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return reply({ error: 'Supabase configuration is incomplete.' }, 503);
  try {
    const client = createClient(url, key, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
    const { data, error } = await client.auth.getUser(authorization.slice(7));
    if (error || !data.user) return reply({ error: 'Your session expired. Sign in again.' }, 401);
    const params = Object.fromEntries(new URL(request.url).searchParams);
    const parsed = searchSchema.safeParse({ keywords: '', location: '', remote: 'any', contract: 'any', ...params });
    if (!parsed.success) return reply({ error: parsed.error.issues[0].message }, 400);
    const { page, ...preferences } = parsed.data;
    return reply(await searchAdzuna(preferences, page));
  } catch (error) {
    if (error instanceof ListingsError) return reply({ error: error.message }, error.status);
    return reply({ error: 'Could not search for offers. Please try again.' }, 500);
  }
}
