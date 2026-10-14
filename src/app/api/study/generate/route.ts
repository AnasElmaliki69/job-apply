import { createClient } from '@supabase/supabase-js';
import { generateQuizSchema, materialSchema, StudyError } from '@/lib/study';
import { generateStudyQuiz } from '@/lib/study-gemini';
export const runtime = 'nodejs';
export const maxDuration = 120;
const reply = (body: object, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
export async function POST(request: Request) {
  const authorization = request.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ') || !authorization.slice(7)) return reply({ error: 'Sign in to generate a quiz.' }, 401);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return reply({ error: 'Supabase configuration is incomplete.' }, 503);
  try {
    const client = createClient(url,key,{ global: { headers: { Authorization: authorization } }, auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
    const { data, error } = await client.auth.getUser(authorization.slice(7));
    if (error || !data.user) return reply({ error: 'Your session expired. Sign in again.' },401);
    let body: unknown;
    try { body = await request.json(); } catch { return reply({ error: 'Send valid quiz settings.' },400); }
    const parsed = generateQuizSchema.safeParse(body);
    if (!parsed.success) return reply({ error: 'Choose saved study material and 5 or 10 questions.' },400);
    const material = await client.from('study_materials').select('subject_id,topic,content').eq('id',parsed.data.materialId).eq('user_id',data.user.id).maybeSingle();
    if (material.error) return reply({ error: 'Could not load study material. Check the Study SQL migration.' },500);
    if (!material.data) return reply({ error: 'Study material not found. Save your notes first.' },404);
    const source = materialSchema.safeParse(material.data);
    if (!source.success) return reply({ error: 'Add a topic and 50–20,000 characters of study material.' },400);
    if (!process.env.GEMINI_API_KEY) return reply({ error: 'Add GEMINI_API_KEY to .env.local and restart the app.' },503);
    const reserve = await client.rpc('study_reserve_generation');
    if (reserve.error) return reply({ error: 'Could not prepare generation. Check the Study SQL migration.' },500);
    if (!reserve.data) return reply({ error: 'Please wait 30 seconds between quiz generations. You can retry a saved quiz immediately.' },429);
    const questions = await generateStudyQuiz(source.data.topic,source.data.content,parsed.data.count);
    const saved = await client.rpc('study_create_quiz',{ p_material_id: parsed.data.materialId, p_questions: questions });
    if (saved.error || !saved.data) return reply({ error: 'The generated quiz could not be saved. Your material is safe. Check your connection before generating again.' },500);
    // Never include the answer key or explanations in the generation response.
    return reply({ id: saved.data });
  } catch (error) {
    if (error instanceof StudyError) return reply({ error: error.message },error.status);
    return reply({ error: 'Could not generate a quiz. Your study material is saved; try later.' },500);
  }
}
