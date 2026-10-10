"use client";
import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Check } from "lucide-react";
import { useSession } from "@/components/session";
import { Brand, Feedback } from "@/components/ui";
import { message } from "@/lib/schemas";
export default function Login() {
  const { client, session, loading, error: setupError } = useSession();
  const router = useRouter();
  const [signup, setSignup] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => { if (session) router.replace("/dashboard"); }, [session, router]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!client || busy) return;
    setBusy(true); setError(""); setNotice("");
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim();
    const password = String(form.get("password") ?? "");
    try {
      if (!email || !password) throw new Error("Enter your email and password.");
      const result = signup ? await client.auth.signUp({ email, password, options: { emailRedirectTo: `${window.location.origin}/login` } }) : await client.auth.signInWithPassword({ email, password });
      if (result.error) throw result.error;
      if (signup && !result.data.session) setNotice("Check your email to confirm your account, then sign in.");
    } catch (error) { setError(message(error)); } finally { setBusy(false); }
  }
  return <main className="grid min-h-screen lg:grid-cols-2">
    <section className="hidden flex-col justify-between bg-indigo-950 p-14 text-white lg:flex"><div className="text-white"><Brand/></div><div className="max-w-md"><span className="rounded-full border border-indigo-700 px-3 py-1.5 text-xs text-indigo-200">YOUR NEXT CHAPTER</span><h1 className="mt-7 text-5xl font-semibold leading-tight tracking-tight">Less guesswork.<br/>More opportunity.</h1><p className="mt-5 leading-7 text-indigo-200">Bring your applications together. Understand your fit. Put your experience into words that matter.</p><div className="mt-8 space-y-4 text-sm text-indigo-100">{["All your applications, one clear view", "CV insights tailored to each opportunity", "A little more confidence at every step"].map(text => <p key={text} className="flex gap-3"><Check size={18} className="text-indigo-300"/>{text}</p>)}</div></div><p className="text-xs text-indigo-300">A simpler way to find your next role.</p></section>
    <section className="flex items-center justify-center px-6 py-12"><div className="w-full max-w-sm"><div className="mb-12 lg:hidden"><Brand/></div><p className="mb-3 text-xs font-semibold uppercase tracking-widest text-indigo-600">Welcome to JobApply</p><h2 className="text-3xl font-semibold tracking-tight">{signup ? "Start your next chapter" : "Good to see you again"}</h2><p className="mb-8 mt-3 text-sm text-slate-500">{signup ? "Create an account to get started." : "Sign in to pick up where you left off."}</p><Feedback error={error || setupError} notice={notice}/><form onSubmit={submit} className="space-y-5"><label className="label">Email address<input className="field" name="email" type="email" autoComplete="email" placeholder="you@example.com" required disabled={busy}/></label><label className="label">Password<input className="field" name="password" type="password" minLength={signup ? 8 : 1} autoComplete={signup ? "new-password" : "current-password"} placeholder={signup ? "At least 8 characters" : "Enter your password"} required disabled={busy}/></label><button className="button w-full" disabled={loading || busy || !client}>{busy ? "Please wait..." : signup ? "Create account" : "Sign in"}<ArrowRight size={16}/></button></form><button className="mt-6 text-sm text-indigo-600" disabled={busy} onClick={() => { setSignup(!signup); setError(""); setNotice(""); }}>{signup ? "Already have an account? Sign in" : "New here? Create an account"}</button></div></section>
  </main>;
}
