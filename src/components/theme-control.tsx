'use client';
import { Monitor, Moon, Sun } from 'lucide-react';
import { useTheme } from './theme-provider';
import { themePreference } from '@/lib/theme';

export function ThemeControl() {
  const { preference,ready,change } = useTheme();
  const Icon = preference === 'dark' ? Moon : preference === 'light' ? Sun : Monitor;
  return <label className="theme-control flex flex-wrap items-center gap-3 text-sm font-medium"><span className="inline-flex items-center gap-2"><Icon size={16} aria-hidden="true"/>Theme</span><select className="field theme-select" aria-label="Color theme" value={preference} disabled={!ready} onChange={event => change(themePreference(event.target.value))}><option value="light">Light</option><option value="dark">Dark</option><option value="system">System</option></select></label>;
}
