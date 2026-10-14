'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useSession } from './session';
import { Feedback, Heading, Loading } from './ui';
import { message } from '@/lib/schemas';
import type { StudyMaterial, StudyQuiz } from '@/lib/study';

export default function StudyMaterialPage({ id }: { id: string }) {
  const { client,session } = useSession(); const userId = session?.user.id; const router = useRouter();
  const [material,setMaterial] = useState<StudyMaterial | null>(null); const [quizzes,setQuizzes] = useState<StudyQuiz[]>([]);
  const [count,setCount] = useState(5); const [busy,setBusy] = useState(false); const generating = useRef(false);
  const [loading,setLoading] = useState(true); const [error,setError] = useState(''); const [reload,setReload] = useState(0);
  useEffect(() => {
    if (!client || !userId) return;
    let active = true; setLoading(true); setError('');
    void (async () => {
      try {
        const [material,quizzes] = await Promise.all([
          client.from('study_materials').select('id,subject_id,topic,content,created_at').eq('id',id).eq('user_id',userId).maybeSingle(),
          client.from('study_quizzes').select('id,material_id,title,question_count,created_at').eq('material_id',id).eq('user_id',userId).order('created_at',{ ascending: false }),
        ]);
        if (material.error) throw material.error; if (quizzes.error) throw quizzes.error;
        if (!material.data) throw new Error('Material not found. Return to Study and choose saved material.');
        if (active) { setMaterial(material.data); setQuizzes(quizzes.data); }
      } catch (err) { if (active) setError(message(err)); } finally { if (active) setLoading(false); }
    })(); return () => { active = false; };
  },[client,userId,id,reload]);
  async function generate() {
    if (!client || generating.current) return;
    generating.current = true; setBusy(true); setError('');
    try {
      const { data,error } = await client.auth.getSession(); if (error) throw error;
      if (!data.session) throw new Error('Sign in again to generate a quiz.');
      const response = await fetch('/api/study/generate',{ method: 'POST',headers: { 'Content-Type':'application/json',Authorization: `Bearer ${data.session.access_token}` },body: JSON.stringify({ materialId: id,count }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error || 'Could not generate a quiz.');
      router.push(`/study/quizzes/${result.id}`);
    } catch (err) { setError(message(err)); } finally { generating.current = false; setBusy(false); }
  }
  return <>
    <Link href="/study" className="mb-5 inline-block text-sm text-indigo-600">← Study</Link>
    <Heading title={material?.topic ?? 'Study material'} subtitle="Generate a new quiz, or retry a saved one with no AI request."/>
    <Feedback error={error}/>{error && <button className="secondary mb-4" disabled={busy} onClick={() => setReload(value => value+1)}>Reload material</button>}
    {loading ? <Loading/> : material && <div className="space-y-6">
      <section className="card"><h2 className="font-semibold">Test yourself</h2><p className="mt-2 text-sm text-slate-500">One Gemini request per generation. New questions and explanations are in English. Answers stay hidden until you submit the whole quiz.</p>
        <div className="mt-5 flex flex-wrap items-end gap-3"><label className="label">Questions<select className="field" disabled={busy} value={count} onChange={event => setCount(Number(event.target.value))}><option value={5}>5 questions</option><option value={10}>10 questions</option></select></label><button className="button" disabled={busy} onClick={() => void generate()}>{busy ? 'Generating & saving…' : 'Generate quiz'}</button></div>
        {busy && <Loading>Your notes are safe. Generation can take up to 90 seconds…</Loading>}
        <p className="mt-4 text-xs text-slate-500">AI can make mistakes. Results include an excerpt from your notes so you can check the explanation. Add enough detail for distinct questions.</p>
      </section>
      <section><h2 className="mb-3 text-lg font-semibold">Saved quizzes</h2>{!quizzes.length ? <div className="card text-sm text-slate-500">No quiz yet. Start with 5 questions above.</div> : <div className="grid gap-3 sm:grid-cols-2">{quizzes.map(quiz => <Link key={quiz.id} href={`/study/quizzes/${quiz.id}`} className="card hover:border-indigo-300"><h3 className="font-semibold">{quiz.question_count} questions</h3><p className="mt-2 text-sm text-slate-500">{new Date(quiz.created_at).toLocaleString()}</p><p className="mt-3 text-sm text-indigo-600">Take quiz / previous scores →</p></Link>)}</div>}</section>
      <details className="card"><summary className="cursor-pointer font-semibold">Saved study material</summary><p className="mt-4 whitespace-pre-wrap break-words text-sm leading-7 text-slate-600">{material.content}</p></details>
    </div>}
  </>;
}
