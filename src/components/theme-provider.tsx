'use client';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { persistTheme, readTheme, resolveTheme, themePreference, themeStorageKey, type ThemePreference } from '@/lib/theme';

const ThemeContext = createContext<{ preference:ThemePreference; ready:boolean; change:(value:ThemePreference)=>void }>({ preference:'system',ready:false,change:()=>{} });
export function ThemeProvider({ children }: { children:ReactNode }) {
  // Matching SSR state avoids hydration mismatches. The bootstrap already set colors.
  const [preference,setPreference] = useState<ThemePreference>('system'); const [ready,setReady] = useState(false);
  useEffect(() => {
    let initial:ThemePreference = 'system';
    try { initial = readTheme(window.localStorage); } catch { /* Blocked storage: follow system. */ }
    setPreference(initial); setReady(true);
    const sync = (event:StorageEvent) => { if (event.key === themeStorageKey || event.key === null) setPreference(themePreference(event.newValue)); };
    window.addEventListener('storage',sync); return () => window.removeEventListener('storage',sync);
  },[]);
  useEffect(() => {
    if (!ready) return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => { const resolved = resolveTheme(preference,media.matches); document.documentElement.dataset.theme = resolved; document.documentElement.style.colorScheme = resolved; };
    apply(); media.addEventListener('change',apply);
    return () => media.removeEventListener('change',apply);
  },[preference,ready]);
  const change = useCallback((value:ThemePreference) => {
    setPreference(value);
    // Apply synchronously to the click, not after an effect or a transition.
    const resolved = resolveTheme(value,window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.dataset.theme = resolved; document.documentElement.style.colorScheme = resolved;
    try { persistTheme(window.localStorage,value); } catch { /* Current session still works. */ }
  },[]);
  return <ThemeContext.Provider value={{ preference,ready,change }}>{children}</ThemeContext.Provider>;
}
export function useTheme() { return useContext(ThemeContext); }
