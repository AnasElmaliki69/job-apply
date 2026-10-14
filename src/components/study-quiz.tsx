'use client';
import Link from 'next/link';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useSession } from './session';
import { Feedback, Heading, Loading } from './ui';
import { message } from '@/lib/schemas';
import type { PublicQuestion, QuestionResult, StudyAttempt, StudyQuiz } from '@/lib/study';

export function StudyResult({ question, index }: { question: QuestionResult; index: number }) {
  return <article className="card space-y-3"><p className={`text-sm font-semibold ${question.correct ? 'text-emerald-700' : 'text-amber-700'}`}>{question.correct ? 'Correct' : question.selected === null ? 'Not sure — review this' : 'Incorrect — review this'}</p>
    <h3 className="font-semibold break-words">{index+1}. {question.prompt}</h3><p className="text-sm"><strong>Your answer:</strong> {question.selected === null ? 'I’m not sure' : question.options[question.selected]}</p><p className="text-sm"><strong>Correct answer:</strong> {question.options[question.correctIndex]}</p><p className="text-sm leading-6">{question.explanation}</p><p className="text-xs text-slate-500">Review: {question.reviewTopic}</p><blockquote className="border-l-2 border-indigo-200 pl-3 text-sm text-slate-500">From your notes: “{question.evidence}”</blockquote>
  </article>;
}
export default function StudyQuizPage({ id }: { id: string }) {
  const { client,session } = useSession(); const userId = session?.user.id;
  const [quiz,setQuiz] = useState<StudyQuiz | null>(null); const [questions,setQuestions] = useState<PublicQuestion[]>([]); const [attempts,setAttempts] = useState<StudyAttempt[]>([]);
  const [answers,setAnswers] = useState<Record<number,number | null>>({}); const [result,setResult] = useState<StudyAttempt | null>(null);
  const [loading,setLoading] = useState(true); const [busy,setBusy] = useState(false); const submitting = useRef(false); const attemptId = useRef('');
  const [error,setError] = useState(''); const [reload,setReload] = useState(0);
  useEffect(() => {
    if (!client || !userId) return;
    let active = true; setLoading(true); setError(''); setAnswers({}); setResult(null); attemptId.current = '';
    void (async () => {
      try {
        const [quiz,questions,attempts] = await Promise.all([
          client.from('study_quizzes').select('id,material_id,title,question_count,created_at').eq('id',id).eq('user_id',userId).maybeSingle(),
          client.rpc('study_quiz_questions',{ p_quiz_id: id }),
          client.from('study_attempts').select('*').eq('quiz_id',id).eq('user_id',userId).order('created_at',{ ascending: false }).limit(50),
        ]);
        for (const response of [quiz,questions,attempts]) if (response.error) throw response.error;
        if (!quiz.data || !questions.data) throw new Error('Quiz not found. Choose a saved quiz from Study.');
        if (active) { setQuiz(quiz.data); setQuestions(questions.data); setAttempts(attempts.data as StudyAttempt[]); }
      } catch (err) { if (active) setError(message(err)); } finally { if (active) setLoading(false); }
    })(); return () => { active = false; };
  },[client,userId,id,reload]);
  async function submit(event: FormEvent) {
    event.preventDefault(); if (!client || submitting.current || result) return;
    if (questions.some((_,index) => !(index in answers))) { setError('Answer every question, or choose “I’m not sure”, before submitting.'); return; }
    submitting.current = true; setBusy(true); setError('');
    if (!attemptId.current) attemptId.current = crypto.randomUUID();
    try {
      const response = await client.rpc('study_submit_attempt',{ p_quiz_id: id,p_attempt_id: attemptId.current,p_answers: questions.map((_,index) => answers[index]) });
      if (response.error) throw response.error;
      const saved = response.data as StudyAttempt;
      setResult(saved); setAttempts(values => [saved,...values.filter(attempt => attempt.id !== saved.id)]);
      window.scrollTo({ top: 0,behavior: 'smooth' });
    } catch (err) { setError(`Could not save your answers. ${message(err)} You can submit again safely.`); } finally { submitting.current = false; setBusy(false); }
  }
  function retry() { setAnswers({}); setResult(null); setError(''); attemptId.current = ''; window.scrollTo({ top: 0,behavior: 'smooth' }); }
  const answered = Object.keys(answers).length;
  const reviewTopics = result ? [...new Set(result.results.filter(question => !question.correct).map(question => question.reviewTopic))] : [];
  return <>
    <Link href={quiz ? `/study/materials/${quiz.material_id}` : '/study'} className="mb-5 inline-block text-sm text-indigo-600">← {quiz ? 'Material & quizzes' : 'Study'}</Link>
    <Heading title={quiz?.title ?? 'Quiz'} subtitle={result ? 'Your answers are saved. Review the explanations, then test yourself again.' : 'Choose an answer or “I’m not sure” for every question. Submit once at the end.'}/>
    <Feedback error={error}/>{!quiz && error && <button className="secondary" onClick={() => setReload(value => value+1)}>Reload quiz</button>}
    {loading ? <Loading>Loading quiz…</Loading> : quiz && <>
      {result ? <div className="space-y-4"><section className="card"><p className="text-3xl font-semibold text-indigo-700">{result.score} / {result.total} <span className="text-lg">({Math.round(result.score/result.total*100)}%)</span></p><h2 className="mt-4 font-semibold">Topics to review</h2><p className="mt-2 text-sm text-slate-600">{reviewTopics.length ? reviewTopics.join(' · ') : 'All correct — well done. You can test yourself again later.'}</p><div className="mt-5 flex flex-wrap gap-3"><button className="button" onClick={retry}>Retry this quiz · no AI call</button><Link href="/study/review" className="secondary">Review again</Link></div></section>{result.results.map((question,index) => <StudyResult question={question} index={index} key={index}/>)}</div> : <form className="space-y-4" onSubmit={submit}>
        <p role="status" className="text-sm text-slate-500">{answered} / {questions.length} answered · retrying uses the saved questions</p>
        {questions.map((question,index) => <fieldset disabled={busy} key={index} className="card min-w-0"><legend className="sr-only">Question {index+1}</legend><h2 className="mb-4 font-semibold break-words">{index+1}. {question.prompt}</h2><div className="space-y-2">{[...question.options,'I’m not sure'].map((option,choice) => <label key={choice} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm leading-6 ${index in answers && answers[index] === (choice === 4 ? null : choice) ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 hover:bg-slate-50'}`}><input type="radio" className="mt-1 shrink-0" name={`question-${index}`} checked={index in answers && answers[index] === (choice === 4 ? null : choice)} onChange={() => setAnswers(values => ({ ...values,[index]: choice === 4 ? null : choice }))}/><span className="min-w-0 break-words">{option}</span></label>)}</div></fieldset>)}
        <button className="button w-full sm:w-auto" disabled={busy}>{busy ? 'Submitting…' : `Submit quiz (${answered}/${questions.length})`}</button>
      </form>}
      <section className="mt-8"><h2 className="mb-3 text-lg font-semibold">Previous scores</h2>{!attempts.length ? <p className="text-sm text-slate-500">No attempts yet. Your first score appears after submission.</p> : <><p className="mb-3 text-xs text-slate-500">Latest 50 attempts. Opening a previous result reveals its answers.</p><div className="flex flex-wrap gap-2">{attempts.map(attempt => <button key={attempt.id} disabled={busy} className={attempt.id === result?.id ? 'button' : 'secondary'} onClick={() => { setResult(attempt); setError(''); window.scrollTo({ top:0,behavior:'smooth' }); }}>{attempt.score}/{attempt.total} · {new Date(attempt.created_at).toLocaleString()}</button>)}</div></>}</section>
    </>}
  </>;
}
