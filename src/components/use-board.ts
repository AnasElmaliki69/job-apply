'use client';
import { useCallback, useEffect, useState } from 'react';
import { useSession } from './session';
import { message } from '@/lib/schemas';
import type { BoardCard, BoardProject, BoardSolution } from '@/lib/board';

export function useBoard() {
  const { client, session } = useSession();
  const userId = session?.user.id;
  const [cards, setCards] = useState<BoardCard[]>([]);
  const [projects, setProjects] = useState<BoardProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!client || !userId) return;
    let active = true; setLoading(true); setError(''); setCards([]); setProjects([]);
    void (async () => {
      try {
        const results = await Promise.all([
          client.from('board_cards').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
          client.from('board_projects').select('*').eq('user_id', userId).order('name'),
        ]);
        for (const result of results) if (result.error) throw result.error;
        if (active) { setCards((results[0].data ?? []) as BoardCard[]); setProjects((results[1].data ?? []) as BoardProject[]); }
      } catch (err) { if (active) setError(`Could not load your board. ${message(err)} If this is your first visit, run the Board SQL migration in README.md.`); }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [client, userId, attempt]);
  const retry = useCallback(() => setAttempt(value => value + 1), []);
  async function createCard(input: object) {
    if (!client || !userId) throw new Error('Sign in to save a card.');
    const { data, error } = await client.from('board_cards').insert({ ...input, user_id: userId }).select('*').single();
    if (error) throw error;
    setCards(previous => [data as BoardCard, ...previous]); return data as BoardCard;
  }
  async function updateCard(card: BoardCard, input: object) {
    if (!client || !userId) throw new Error('Sign in to update a card.');
    const { data, error } = await client.from('board_cards').update(input).eq('id', card.id).eq('user_id', userId).eq('updated_at', card.updated_at).select('*').maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('This card changed in another tab. Reload before saving.');
    setCards(previous => previous.map(item => item.id === card.id ? data as BoardCard : item));
    return data as BoardCard;
  }
  async function saveProject(name: string, project?: BoardProject, archived_at?: string | null) {
    if (!client || !userId) throw new Error('Sign in to save a project.');
    const query = project ? client.from('board_projects').update({ name, ...(archived_at !== undefined ? { archived_at } : {}) }).eq('id', project.id).eq('user_id', userId).eq('updated_at', project.updated_at) : client.from('board_projects').insert({ name, user_id: userId });
    const { data, error } = await query.select('*').maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('This project changed in another tab. Reload before saving.');
    setProjects(previous => project ? previous.map(item => item.id === project.id ? data as BoardProject : item) : [...previous, data as BoardProject]);
  }
  async function deleteCard(card: BoardCard) {
    if (!client || !userId) throw new Error('Sign in to delete a card.');
    const { data, error } = await client.from('board_cards').delete().eq('id', card.id).eq('user_id', userId).eq('updated_at', card.updated_at).select('id').maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('The card changed or was already removed. Reload before deleting. If deletion is not enabled yet, run the card deletion SQL migration in README.md.');
    setCards(previous => previous.filter(item => item.id !== card.id));
  }
  async function saveSolution(problem: BoardCard, input: object, solution?: BoardSolution) {
    if (!client || !userId || problem.type !== 'problem') throw new Error('Solutions must belong to a problem.');
    const query = solution ? client.from('board_solutions').update(input).eq('id', solution.id).eq('problem_id', problem.id).eq('user_id', userId).eq('updated_at', solution.updated_at) : client.from('board_solutions').insert({ ...input, problem_id: problem.id, user_id: userId });
    const { data, error } = await query.select('*').maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('This solution changed in another tab. Reload before saving.');
    return data as BoardSolution;
  }
  return { client, userId, cards, projects, loading, error, retry, createCard, updateCard, deleteCard, saveProject, saveSolution };
}
