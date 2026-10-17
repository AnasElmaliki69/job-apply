'use client';
import { useRef, useState } from 'react';
import { createActionRunner, emptyActionFeedback } from '@/lib/action-feedback';

// The ref locks synchronously, including repeated clicks before React rerenders.
export function useActionFeedback() {
  const [state,setState] = useState(emptyActionFeedback);
  const runner = useRef<ReturnType<typeof createActionRunner> | null>(null);
  if (!runner.current) runner.current = createActionRunner(setState);
  return { ...state,act:runner.current,setError:(error:string) => setState(value => ({ ...value,error })),setNotice:(notice:string) => setState(value => ({ ...value,notice })) };
}
