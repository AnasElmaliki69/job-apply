export type ThemePreference = 'light' | 'dark' | 'system';
export const themeStorageKey = 'jobapply:theme';
export function themePreference(value: unknown): ThemePreference {
  return value === 'light' || value === 'dark' ? value : 'system';
}
export function resolveTheme(preference: ThemePreference, systemDark: boolean): 'light' | 'dark' {
  return preference === 'system' ? systemDark ? 'dark' : 'light' : preference;
}
export function readTheme(storage: Pick<Storage,'getItem'>): ThemePreference {
  try { return themePreference(storage.getItem(themeStorageKey)); } catch { return 'system'; }
}
export function persistTheme(storage: Pick<Storage,'setItem'>, preference: ThemePreference) {
  try { storage.setItem(themeStorageKey,preference); return true; } catch { return false; }
}
// Standalone, constant script: no user content or secrets. Runs in <head> before body paint.
// Storage failure must still honor the device preference.
export const themeBootstrap = `(function(){var p='system';try{var s=localStorage.getItem('jobapply:theme');if(s==='light'||s==='dark')p=s;}catch(e){}var d=false;try{d=window.matchMedia('(prefers-color-scheme: dark)').matches;}catch(e){}var t=p==='system'?(d?'dark':'light'):p;document.documentElement.dataset.theme=t;document.documentElement.style.colorScheme=t;})();`;
