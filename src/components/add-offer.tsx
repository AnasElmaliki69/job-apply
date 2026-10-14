"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Sparkles } from "lucide-react";
import { useSession } from "@/components/session";
import { Feedback, Heading, Loading } from "@/components/ui";
import { offerSchema, message } from "@/lib/schemas";
import { listingSchema, listingText } from '@/lib/explore';
import { AdzunaAttribution } from './adzuna-attribution';
export default function AddOffer({ offerId }: { offerId?: string }) {
  const { client, session } = useSession(); const router = useRouter(); const locked = useRef(false);
  const userId = session?.user.id;
  const [offer, setOffer] = useState({ jobTitle: '', company: '', jobOfferText: '' });
  const [loadingOffer, setLoadingOffer] = useState(!!offerId);
  const [loadedOffer, setLoadedOffer] = useState(false);
  const [existingId, setExistingId] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  useEffect(() => {
    if (!offerId || !client || !userId) return;
    let active = true; setLoadingOffer(true); setLoadedOffer(false); setError(''); setExistingId(null);
    void (async () => {
      try {
        const { data, error } = await client.from('explore_offers').select('listing,state').eq('id',offerId).eq('user_id',userId).maybeSingle();
        if (error) throw error;
        if (!data || data.state !== 'saved') throw new Error('Save this offer in Explore offers before preparing an application.');
        const listing = listingSchema.parse(data.listing);
        const existing = await client.from('applications').select('id').eq('user_id',userId).eq('source_offer_id',offerId).maybeSingle();
        if (existing.error) throw existing.error;
        if (active) { setOffer({ jobTitle: listing.title, company: listing.company, jobOfferText: listingText(listing) }); setExistingId(existing.data?.id ?? null); setLoadedOffer(true); }
      } catch (err) { if (active) setError(message(err)); }
      finally { if (active) setLoadingOffer(false); }
    })();
    return () => { active = false; };
  }, [offerId, client, userId, attempt]);
  async function analyze(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!client || locked.current) return; locked.current = true; setBusy(true); setError("");
    const form = new FormData(event.currentTarget);
    try {
      const parsed = offerSchema.safeParse({ jobTitle: String(form.get("jobTitle") ?? ""), company: String(form.get("company") ?? ""), jobOfferText: String(form.get("jobOfferText") ?? "") });
      if (!parsed.success) throw new Error(parsed.error.issues[0].message);
      const { data, error } = await client.auth.getSession(); if (error) throw error; if (!data.session) throw new Error("Your session expired. Sign in again.");
      const response = await fetch("/api/analyze", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session.access_token}` }, body: JSON.stringify({ ...parsed.data, ...(offerId ? { savedOfferId: offerId } : {}) }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error ?? "Analysis failed. Please try again.");
      router.push(`/applications/${result.applicationId}`);
    } catch (error) { setError(message(error)); } finally { locked.current = false; setBusy(false); }
  }
  if (loadingOffer) return <Loading>Loading your saved offer…</Loading>;
  if (offerId && !loadedOffer) return <div className="card"><Feedback error={error}/><div className="flex gap-3"><button className="secondary" onClick={() => setAttempt(value => value + 1)}>Retry</button><Link className="secondary" href="/explore">Back to Explore offers</Link></div></div>;
  if (existingId) return <div className="card"><h1 className="text-xl font-semibold">Application already prepared</h1><p className="my-4 text-sm text-slate-500">This saved offer already has an application. Open it to review your CV and letter.</p><Link className="button" href={`/applications/${existingId}`}>Open application</Link></div>;
  return <div className="max-w-3xl"><Heading title="Add a job offer" subtitle="Understand your fit. Prepare your next move."/><Feedback error={error}/>{offerId && <div className="card mb-5"><p className="text-sm font-medium">Saved offer from <AdzunaAttribution/></p><p className="mt-2 text-sm text-slate-500">The API supplied an excerpt, not the complete advert. Review the details below and verify the original listing before generating. You can analyze this excerpt without pasting anything.</p></div>}<form className="card space-y-6" onSubmit={analyze}><div className="grid gap-5 sm:grid-cols-2"><label className="label">Job title<input className="field" name="jobTitle" value={offer.jobTitle} onChange={event => setOffer(value => ({ ...value, jobTitle: event.target.value }))} maxLength={200} required disabled={busy} placeholder="e.g. Frontend Developer"/></label><label className="label">Company<input className="field" name="company" value={offer.company} onChange={event => setOffer(value => ({ ...value, company: event.target.value }))} maxLength={200} required disabled={busy} placeholder="e.g. Acme"/></label></div><label className="label">Job offer text<textarea className="field min-h-72" name="jobOfferText" value={offer.jobOfferText} onChange={event => setOffer(value => ({ ...value, jobOfferText: event.target.value }))} maxLength={30000} required disabled={busy} placeholder="Paste the full job description, responsibilities, and requirements..."/></label><div className="rounded-xl bg-indigo-50 p-4 text-xs leading-6 text-indigo-800">We’ll compare this offer with your <Link href="/profile" className="font-semibold underline">saved CV</Link> and prepare a tailored CV, change highlights, a lettre de motivation, and interview questions — all in French.</div><p className="text-xs text-slate-400">Your CV and this offer will be sent to your configured AI provider (Gemini or OpenAI) when you click Analyze Offer.</p><button className="button" disabled={busy}><Sparkles size={16}/>{busy ? "Analyzing offer..." : "Analyze Offer"}</button>{busy && <Loading>Preparing your analysis. This can take a minute.</Loading>}</form></div>;
}
