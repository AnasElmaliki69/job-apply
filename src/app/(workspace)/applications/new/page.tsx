"use client";
import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import { useSession } from "@/components/session";
import { Feedback, Heading, Loading } from "@/components/ui";
import { offerSchema, message } from "@/lib/schemas";
export default function AddOffer() {
  const { client } = useSession(); const router = useRouter(); const locked = useRef(false);
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  async function analyze(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!client || locked.current) return; locked.current = true; setBusy(true); setError("");
    const form = new FormData(event.currentTarget);
    try {
      const parsed = offerSchema.safeParse({ jobTitle: String(form.get("jobTitle") ?? ""), company: String(form.get("company") ?? ""), jobOfferText: String(form.get("jobOfferText") ?? "") });
      if (!parsed.success) throw new Error(parsed.error.issues[0].message);
      const { data, error } = await client.auth.getSession(); if (error) throw error; if (!data.session) throw new Error("Your session expired. Sign in again.");
      const response = await fetch("/api/analyze", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session.access_token}` }, body: JSON.stringify(parsed.data) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error ?? "Analysis failed. Please try again.");
      router.push(`/applications/${result.applicationId}`);
    } catch (error) { setError(message(error)); } finally { locked.current = false; setBusy(false); }
  }
  return <div className="max-w-3xl"><Heading title="Add a job offer" subtitle="Understand your fit. Prepare your next move."/><Feedback error={error}/><form className="card space-y-6" onSubmit={analyze}><div className="grid gap-5 sm:grid-cols-2"><label className="label">Job title<input className="field" name="jobTitle" maxLength={200} required disabled={busy} placeholder="e.g. Frontend Developer"/></label><label className="label">Company<input className="field" name="company" maxLength={200} required disabled={busy} placeholder="e.g. Acme"/></label></div><label className="label">Job offer text<textarea className="field min-h-72" name="jobOfferText" maxLength={30000} required disabled={busy} placeholder="Paste the full job description, responsibilities, and requirements..."/></label><div className="rounded-xl bg-indigo-50 p-4 text-xs leading-6 text-indigo-800">We’ll compare this offer with your <Link href="/profile" className="font-semibold underline">saved CV</Link> and prepare a tailored CV, change highlights, a lettre de motivation, and interview questions — all in French.</div><p className="text-xs text-slate-400">Your CV and this offer will be sent to your configured AI provider (Gemini or OpenAI) when you click Analyze Offer.</p><button className="button" disabled={busy}><Sparkles size={16}/>{busy ? "Analyzing offer..." : "Analyze Offer"}</button>{busy && <Loading>Preparing your analysis. This can take a minute.</Loading>}</form></div>;
}
