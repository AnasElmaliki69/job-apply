"use client";
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { LayoutDashboard, FileUser, Plus, LogOut, StickyNote, Search, BookOpen } from 'lucide-react';
import { useSession } from '@/components/session';
import { Brand, Feedback, Loading } from '@/components/ui';
import { message } from '@/lib/schemas';
const workspaceLinks = [{ href:'/board',label:'Board',icon:StickyNote },{ href:'/study',label:'Study',icon:BookOpen }];
const applicationLinks = [{ href:'/dashboard',label:'Applications',icon:LayoutDashboard },{ href:'/explore',label:'Explore offers',icon:Search },{ href:'/applications/new',label:'Add job offer',icon:Plus },{ href:'/profile',label:'Profile / CV',icon:FileUser }];
export default function Workspace({ children }: { children: ReactNode }) {
  const { client,session,loading,error } = useSession(); const router = useRouter(); const pathname = usePathname();
  const [busy,setBusy] = useState(false); const [signoutError,setError] = useState('');
  useEffect(() => { if (!loading && !session && !error) router.replace('/login'); },[loading,session,error,router]);
  async function signOut() { if (!client) return; setBusy(true); setError(''); try { const { error } = await client.auth.signOut(); if (error) throw error; router.replace('/login'); } catch (err) { setError(message(err)); } finally { setBusy(false); } }
  const active = (href: string) => pathname === href || pathname.startsWith(href+'/');
  const navLink = ({ href,label,icon:Icon }: typeof workspaceLinks[number]) => <Link key={href} href={href} aria-current={active(href) ? 'page' : undefined} className={`flex min-h-11 items-center gap-3 rounded-xl px-3 py-3 text-sm ${active(href) ? 'bg-indigo-50 font-semibold text-indigo-700' : 'text-slate-500 hover:bg-slate-50'}`}><Icon size={18}/>{label}</Link>;
  if (error) return <main className="mx-auto max-w-xl p-8"><Brand/><div className="card mt-8"><h1 className="mb-4 text-xl font-semibold">Connect your workspace</h1><Feedback error={error}/><p className="text-sm text-slate-500">See README.md for environment variables and database setup.</p></div></main>;
  if (loading || !session) return <main className="p-8"><Loading/></main>;
  return <div className="min-h-screen md:pl-64">
    <aside className="fixed inset-y-0 left-0 hidden w-64 flex-col overflow-y-auto border-r border-slate-200 bg-white p-6 md:flex"><Link href="/board" aria-label="JobApply home"><Brand/></Link>
      <nav aria-label="Workspace navigation" className="mt-10 space-y-1"><p className="mb-3 px-3 text-[10px] font-semibold uppercase tracking-widest text-slate-400">Workspace</p>{workspaceLinks.map(navLink)}</nav>
      <nav aria-label="Job applications navigation" className="mt-8 space-y-1"><p className="mb-3 px-3 text-[10px] font-semibold uppercase tracking-widest text-slate-400">Job applications</p>{applicationLinks.map(navLink)}</nav>
      <div className="mt-auto pt-10"><p className="mb-4 truncate text-xs text-slate-400" title={session.user.email}>{session.user.email}</p><button className="flex min-h-11 items-center gap-2 text-sm text-slate-500" disabled={busy} onClick={signOut}><LogOut size={16}/>{busy ? 'Signing out…' : 'Sign out'}</button></div>
    </aside>
    <header className="border-b border-slate-200 bg-white px-5 py-4 md:hidden"><div className="flex items-center justify-between gap-3"><Link href="/board" aria-label="JobApply home"><Brand/></Link><button className="secondary" disabled={busy} onClick={signOut}>Sign out</button></div><nav aria-label="Mobile workspace navigation" className="mt-4 flex gap-2">{workspaceLinks.map(navLink)}</nav><details className="mt-3 border-t border-slate-100 pt-3" open={applicationLinks.some(link => active(link.href))}><summary className="cursor-pointer py-2 text-sm font-medium text-slate-500">Job applications</summary><nav aria-label="Mobile job applications navigation" className="mt-2 grid grid-cols-2 gap-1">{applicationLinks.map(navLink)}</nav></details></header>
    <main className="mx-auto max-w-6xl px-5 py-8 sm:px-10 md:py-12"><Feedback error={signoutError}/>{children}</main>
  </div>;
}
