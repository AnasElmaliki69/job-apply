'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { emptyBoardMemory, readBoardMemory, writeBoardMemory, type BoardMemory } from '@/lib/board-memory';

// Session storage keeps each account's workspace separate and survives page navigation.
export function useBoardMemory(userId: string | undefined, loading: boolean) {
  const [memory, setMemory] = useState<BoardMemory>(emptyBoardMemory);
  const [owner, setOwner] = useState<string>();
  const latest = useRef(memory);
  const restored = useRef(false);
  const save = useCallback((value: BoardMemory) => {
    if (!userId) return;
    try { writeBoardMemory(window.sessionStorage, userId, value); } catch { /* Storage can be blocked; the board remains usable. */ }
  }, [userId]);
  useEffect(() => {
    if (!userId) return;
    let value = emptyBoardMemory();
    try { value = readBoardMemory(window.sessionStorage, userId); } catch { /* Use in-memory defaults. */ }
    latest.current = value; restored.current = false; setMemory(value); setOwner(userId);
  }, [userId]);
  const update = useCallback((change: (value: BoardMemory) => BoardMemory) => {
    const value = change(latest.current);
    latest.current = value; setMemory(value); save(value);
  }, [save]);
  const rememberScroll = useCallback(() => {
    const value = { ...latest.current, scrollY: window.scrollY };
    latest.current = value; save(value);
  }, [save]);
  useEffect(() => {
    if (loading || owner !== userId || !userId) return;
    let frame = 0; let cancelled = false;
    if (!restored.current) {
      const target = latest.current.scrollY;
      // Wait for the restored filters and loaded cards to finish laying out.
      frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(() => {
          if (cancelled) return;
          window.scrollTo({ top: target, behavior: 'instant' }); restored.current = true;
          window.addEventListener('scroll', rememberScroll, { passive: true });
        });
      });
    } else window.addEventListener('scroll', rememberScroll, { passive: true });
    window.addEventListener('pagehide', rememberScroll);
    return () => { cancelled = true; cancelAnimationFrame(frame); window.removeEventListener('scroll', rememberScroll); window.removeEventListener('pagehide', rememberScroll); };
  }, [loading, owner, userId, rememberScroll]);
  return { memory, update, rememberScroll, ready: !!userId && owner === userId };
}
