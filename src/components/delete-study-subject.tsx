'use client';
import { useRef, useState, type FormEvent } from 'react';
import { BoardModal } from './board-modal';
import { Feedback } from './ui';
import { useSession } from './session';
import { message } from '@/lib/schemas';
import type { StudySubject } from '@/lib/study';

export function DeleteStudySubject({subject,onClose,onDeleted}:{subject:StudySubject;onClose:()=>void;onDeleted:(id:string)=>void}) {
  const {client}=useSession();const [confirmation,setConfirmation]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const deleting=useRef(false);
  async function remove(event:FormEvent) {
    event.preventDefault();if (!client || deleting.current || confirmation!==subject.name) return;
    deleting.current=true;setBusy(true);setError('');
    try {
      const result=await client.rpc('study_delete_subject',{p_subject_id:subject.id});
      if (result.error) throw result.error;
      if (result.data!==true) throw new Error('Subject was not deleted. Reload Study and try again.');
      onDeleted(subject.id);
    } catch(err) {setError(`Could not delete the subject. ${message(err)} Check that the Study subject deletion migration has been applied.`);}
    finally {deleting.current=false;setBusy(false);}
  }
  return <BoardModal title={`Delete “${subject.name}”?`} description="This permanently deletes the subject, all of its saved materials, quizzes, previous scores and review mistakes. This cannot be undone. Other subjects are kept." busy={busy} onClose={onClose}>
    <Feedback error={error}/>
    <form className="space-y-4" onSubmit={event=>void remove(event)}>
      <label className="label">Type the subject name to confirm<input data-autofocus className="field" required disabled={busy} autoComplete="off" value={confirmation} onChange={event=>setConfirmation(event.target.value)}/></label>
      <p className="break-words text-sm text-slate-600">Subject: <strong>{subject.name}</strong></p>
      <div className="flex flex-wrap gap-3"><button type="button" className="secondary" disabled={busy} onClick={onClose}>Cancel</button><button className="button bg-rose-700 hover:bg-rose-800" disabled={busy || confirmation!==subject.name}>{busy?'Deleting…':'Delete subject permanently'}</button></div>
    </form>
  </BoardModal>;
}
