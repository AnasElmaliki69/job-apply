'use client';
import Link from 'next/link';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Trash2 } from 'lucide-react';
import { useSession } from './session';
import { Feedback, Heading, Loading } from './ui';
import { message } from '@/lib/schemas';
import { materialSchema, selectStudySubject, subjectSchema, type StudyMaterial, type StudySubject } from '@/lib/study';
import { DeleteStudySubject } from './delete-study-subject';

export default function Study() {
  const { client, session } = useSession(); const userId = session?.user.id;
  const [subjects,setSubjects] = useState<StudySubject[]>([]); const [materials,setMaterials] = useState<StudyMaterial[]>([]);
  const [subjectId,setSubjectId] = useState(''); const [name,setName] = useState(''); const [topic,setTopic] = useState(''); const [content,setContent] = useState('');
  const [loading,setLoading] = useState(true); const [busy,setBusy] = useState(false); const [error,setError] = useState(''); const [notice,setNotice] = useState(''); const [reload,setReload] = useState(0);
  const [deleting,setDeleting]=useState<StudySubject|null>(null);const topicInput=useRef<HTMLInputElement>(null),focused=useRef(false);
  useEffect(() => {
    if (!client || !userId) return;
    let active = true; setLoading(true); setError('');
    void (async () => {
      try {
        const subjects = await client.from('study_subjects').select('id,name').eq('user_id',userId).order('created_at');
        if (subjects.error) throw subjects.error;
        if (active) { setSubjects(subjects.data); setSubjectId(current => selectStudySubject(subjects.data,current,new URLSearchParams(window.location.search).get('subject'))); }
      } catch (err) { if (active) setError(`Could not load Study. ${message(err)} Apply the Study migration from README.md if needed.`); }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  },[client,userId,reload]);
  useEffect(()=>{
    if (!loading && subjectId && !focused.current && window.location.hash==='#new-material') {
      focused.current=true;topicInput.current?.focus({preventScroll:true});document.getElementById('new-material')?.scrollIntoView({block:'start'});
    }
  },[loading,subjectId]);
  const [materialsLoading,setMaterialsLoading] = useState(false);
  useEffect(() => {
    if (!client || !userId || !subjectId) {setMaterials([]);setMaterialsLoading(false);return;}
    let active = true; setMaterialsLoading(true); setMaterials([]);
    void (async () => {
      const result = await client.from('study_materials').select('id,subject_id,topic,content,created_at').eq('user_id',userId).eq('subject_id',subjectId).order('created_at',{ ascending: false });
      if (active) { if (result.error) setError(message(result.error)); else setMaterials(result.data); setMaterialsLoading(false); }
    })().catch(err => { if (active) { setError(message(err)); setMaterialsLoading(false); } });
    return () => { active = false; };
  },[client,userId,subjectId,reload]);
  async function addSubject(event: FormEvent) {
    event.preventDefault(); if (!client || !userId || busy) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const parsed = subjectSchema.parse({ name });
      const result = await client.from('study_subjects').insert({ ...parsed,user_id: userId }).select('id,name').single();
      if (result.error) throw result.error;
      setSubjects(values => [...values,result.data]); setSubjectId(result.data.id); setName(''); setNotice('Subject created. Add a topic and your notes below.');
    } catch (err) { setError(message(err)); } finally { setBusy(false); }
  }
  async function addMaterial(event: FormEvent) {
    event.preventDefault(); if (!client || !userId || busy) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const input = materialSchema.parse({ subject_id: subjectId,topic,content });
      const result = await client.from('study_materials').insert({ ...input,user_id: userId }).select('id,subject_id,topic,content,created_at').single();
      if (result.error) throw result.error;
      setMaterials(values => [result.data,...values]); setTopic(''); setContent(''); setNotice('Material saved. Open it below to generate a quiz.');
    } catch (err) { setError(message(err)); } finally { setBusy(false); }
  }
  return <>
    <Heading title="Study" subtitle="Test what you learned, understand mistakes, then try again." action={<Link href="/study/review" className="secondary">Review again</Link>}/>
    <Feedback error={error} notice={notice}/>
    {error && <button className="secondary mb-5" disabled={busy} onClick={() => setReload(value => value+1)}>Reload Study</button>}
    {loading ? <Loading>Loading subjects…</Loading> : <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
      <aside className="card self-start"><h2 className="mb-3 font-semibold">Subjects</h2>
        {!subjects.length && <p className="mb-4 text-sm text-slate-500">Start with a subject, such as biology or programming.</p>}
        <nav aria-label="Study subjects" className="mb-5 flex flex-wrap gap-2 lg:flex-col">{subjects.map(subject => <div key={subject.id} className="flex min-w-0 items-center gap-1"><button disabled={busy} aria-pressed={subjectId === subject.id} onClick={() => { setSubjectId(subject.id); setNotice(''); }} className={`min-h-11 min-w-0 flex-1 rounded-lg px-3 py-2 text-left text-sm break-words ${subjectId === subject.id ? 'bg-indigo-50 font-semibold text-indigo-700' : 'hover:bg-slate-50'}`}>{subject.name}</button><button type="button" disabled={busy} className="secondary min-h-11 min-w-11 shrink-0 px-2 text-rose-700" aria-label={`Delete subject ${subject.name}`} title={`Delete ${subject.name}`} onClick={()=>setDeleting(subject)}><Trash2 size={15}/></button></div>)}</nav>
        <form onSubmit={addSubject} className="space-y-3"><label className="label">New subject<input className="field" value={name} onChange={event => setName(event.target.value)} maxLength={100} required placeholder="Biology"/></label><button className="secondary w-full" disabled={busy}>Add subject</button></form>
      </aside>
      <section className="min-w-0 space-y-6">{subjectId && <>
        <form id="new-material" className="card scroll-mt-6 space-y-4" onSubmit={addMaterial}><h2 className="font-semibold">Add new material</h2>
          <p className="text-sm text-slate-500">Saving to <strong>{subjects.find(subject => subject.id === subjectId)?.name}</strong>. Keep adding new topics as you study. Each material gets its own quizzes; previous material and scores stay saved. Saving notes does not call Gemini.</p>
          <label className="label">Topic<input ref={topicInput} className="field" required maxLength={200} placeholder="For example: photosynthesis" value={topic} onChange={event => setTopic(event.target.value)}/></label>
          <label className="label">Study material<textarea className="field min-h-48" required minLength={50} maxLength={20000} placeholder="Paste notes, excerpts or a summary of what you learned…" value={content} onChange={event => setContent(event.target.value)}/></label>
          <div className="flex flex-wrap items-center justify-between gap-3"><span className="text-xs text-slate-500">{content.length.toLocaleString()} / 20,000 characters · minimum 50</span><button className="button" disabled={busy}>{busy ? 'Saving…' : 'Save material'}</button></div>
        </form>
        <div><h2 className="mb-3 text-lg font-semibold">Saved material</h2>{materialsLoading ? <Loading>Loading material…</Loading> : !materials.length ? <div className="card text-sm text-slate-500">No material in this subject yet. Paste your notes above to get started.</div> : <div className="grid gap-3 sm:grid-cols-2">{materials.map(material => <Link className="card block hover:border-indigo-300" href={`/study/materials/${material.id}`} key={material.id}><h3 className="font-semibold break-words">{material.topic}</h3><p className="mt-2 line-clamp-2 text-sm text-slate-500">{material.content}</p><p className="mt-4 text-xs text-indigo-600">Open material & quizzes →</p></Link>)}</div>}</div>
      </>}</section>
    </div>}
    {deleting && <DeleteStudySubject subject={deleting} onClose={()=>setDeleting(null)} onDeleted={id=>{
      const remaining=subjects.filter(subject=>subject.id!==id);setSubjects(remaining);setDeleting(null);setError('');setNotice('Subject deleted with its materials, quizzes and scores.');
      if (subjectId===id) {setSubjectId(remaining[0]?.id??'');setMaterials([]);setTopic('');setContent('');}
    }}/>}
  </>;
}
