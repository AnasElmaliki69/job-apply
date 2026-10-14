'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useSession } from './session';
import { Feedback, Heading, Loading } from './ui';
import { message } from '@/lib/schemas';
import type { QuestionResult } from '@/lib/study';

type ReviewItem = { quizId: string; title: string; index: number; question: QuestionResult };
function ReviewCard({ item }: { item: ReviewItem }) {
  const [choice,setChoice] = useState<number | null | undefined>(undefined); const [revealed,setRevealed] = useState(false);
  const question = item.question;
  return <article className="card space-y-4"><p className="text-xs font-semibold text-indigo-600">{item.title} · {question.reviewTopic}</p><h2 className="font-semibold break-words">{question.prompt}</h2>
    <p className="text-xs text-slate-500">Last quiz: {question.selected === null ? 'not sure' : 'incorrect'}. Practice here without changing your saved score.</p>
    <fieldset disabled={revealed} className="space-y-2"><legend className="sr-only">Practice answer</legend>{[...question.options,'I’m not sure'].map((option,index) => <label key={index} className="flex items-start gap-3 rounded-lg border border-slate-200 p-3 text-sm"><input type="radio" className="mt-1" name={`${item.quizId}-${item.index}`} checked={choice === (index === 4 ? null : index)} onChange={() => setChoice(index === 4 ? null : index)}/><span className="min-w-0 break-words">{option}</span></label>)}</fieldset>
    {!revealed ? <button className="secondary" disabled={choice === undefined} onClick={() => setRevealed(true)}>Check answer</button> : <div className="space-y-3 rounded-xl bg-slate-50 p-4 text-sm"><p className="font-semibold">{choice === question.correctIndex ? 'Correct' : 'Keep reviewing'} · {question.options[question.correctIndex]}</p><p>{question.explanation}</p><blockquote className="border-l-2 border-indigo-200 pl-3 text-slate-500">From your notes: “{question.evidence}”</blockquote></div>}
    <Link href={`/study/quizzes/${item.quizId}`} className="inline-block text-sm font-semibold text-indigo-600">Retry full quiz to update your review list →</Link>
  </article>;
}
export default function StudyReview() {
  const { client,session } = useSession(); const userId = session?.user.id;
  const [items,setItems] = useState<ReviewItem[]>([]); const [loading,setLoading] = useState(true); const [error,setError] = useState(''); const [reload,setReload] = useState(0);
  useEffect(() => {
    if (!client || !userId) return;
    let active = true; setLoading(true); setError('');
    void (async () => {
      try {
        const result = await client.rpc('study_review_questions'); if (result.error) throw result.error;
        if (active) setItems(result.data as ReviewItem[]);
      } catch (err) { if (active) setError(message(err)); } finally { if (active) setLoading(false); }
    })(); return () => { active = false; };
  },[client,userId,reload]);
  return <><Link href="/study" className="mb-5 inline-block text-sm text-indigo-600">← Study</Link><Heading title="Review again" subtitle="Wrong and unsure answers from your latest attempt at each quiz. A successful full retry clears them."/>
    <Feedback error={error}/>{error && <button className="secondary" onClick={() => setReload(value => value+1)}>Reload review</button>}
    {loading ? <Loading>Loading questions to review…</Loading> : !error && (!items.length ? <div className="card"><h2 className="font-semibold">Nothing to review yet</h2><p className="mt-2 text-sm text-slate-500">Take a quiz first. Wrong answers and “I’m not sure” choices will appear here.</p><Link href="/study" className="button mt-5">Choose study material</Link></div> : <><p className="mb-4 text-sm text-slate-500">{items.length} question{items.length === 1 ? '' : 's'} to revisit · no Gemini calls</p><div className="space-y-4">{items.map(item => <ReviewCard key={`${item.quizId}-${item.index}`} item={item}/>)}</div></>)}
  </>;
}
