'use client';
import Link from 'next/link';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Search, Bookmark, ExternalLink } from 'lucide-react';
import { useSession } from './session';
import { Heading, Feedback, Loading } from './ui';
import { AdzunaAttribution } from './adzuna-attribution';
import { contractOptions, remoteOptions, defaultPreferences, preferencesSchema, searchSchema, listingSchema, visibleListings, type ExploreOffer, type ExplorePreferences, type ExploreSearchResult, type JobListing } from '@/lib/explore';
import { message } from '@/lib/schemas';
import { loadExploreOffers } from '@/lib/explore-store';

export default function ExploreOffers() {
  const { client, session } = useSession(); const userId = session?.user.id;
  const [preferences, setPreferences] = useState<ExplorePreferences>(defaultPreferences);
  const [searched, setSearched] = useState<ExplorePreferences | null>(null);
  const [offers, setOffers] = useState<ExploreOffer[]>([]);
  const [applications, setApplications] = useState<Record<string,string>>({});
  const [results, setResults] = useState<ExploreSearchResult | null>(null);
  const [tab, setTab] = useState<'results' | 'saved' | 'dismissed'>('results');
  const [showDismissed, setShowDismissed] = useState(false);
  const [loading, setLoading] = useState(true); const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState(false); const [loadError, setLoadError] = useState('');
  const [error, setError] = useState(''); const [notice, setNotice] = useState(''); const [attempt, setAttempt] = useState(0);
  const controller = useRef<AbortController | null>(null);
  async function search(values: ExplorePreferences, page = 1) {
    const parsed = searchSchema.safeParse({ ...values, page });
    if (!parsed.success) { setError(parsed.error.issues[0].message); return; }
    if (!client) return;
    controller.current?.abort(); const request = new AbortController(); controller.current = request;
    setSearching(true); setError(''); setTab('results'); setSearched(values);
    try {
      const { data, error } = await client.auth.getSession(); if (error) throw error;
      if (!data.session) throw new Error('Sign in to explore offers.');
      const params = new URLSearchParams({ ...values, page: String(page) });
      const response = await fetch(`/api/offers?${params}`, { headers: { Authorization: `Bearer ${data.session.access_token}` }, cache: 'no-store', signal: request.signal });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? 'Could not load job offers.');
      if (!request.signal.aborted) setResults(result as ExploreSearchResult);
    } catch (err) { if (!request.signal.aborted) { setResults(null); setError(message(err)); } }
    finally { if (!request.signal.aborted) setSearching(false); }
  }
  useEffect(() => {
    if (!client || !userId) return;
    let active = true; setLoading(true); setLoadError(''); setOffers([]); setResults(null); setApplications({});
    void (async () => {
      try {
        const [prefs, saved, apps] = await Promise.all([
          client.from('explore_preferences').select('keywords,location,remote,contract').eq('user_id', userId).maybeSingle(),
          loadExploreOffers(client, userId),
          client.from('applications').select('id,source_offer_id').eq('user_id', userId).not('source_offer_id','is',null),
        ]);
        for (const result of [prefs,apps]) if (result.error) throw result.error;
        const values = prefs.data ? preferencesSchema.parse(prefs.data) : { ...defaultPreferences };
        const records = saved.map(record => ({ ...record, listing: listingSchema.parse(record.listing) }));
        if (active) {
          setPreferences(values); setOffers(records);
          setApplications(Object.fromEntries((apps.data ?? []).map(app => [app.source_offer_id, app.id])));
          if (values.keywords || values.location) void search(values);
        }
      } catch (err) { if (active) setLoadError(`Could not load Explore offers. ${message(err)} Run the Explore SQL migration from README.md if it has not been applied.`); }
      finally { if (active) setLoading(false); }
    })();
    return () => { active = false; controller.current?.abort(); };
    // Bootstrap only when the signed-in account changes or Retry is selected.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, userId, attempt]);
  async function savePreferences() {
    if (!client || !userId || busy) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const input = preferencesSchema.parse(preferences);
      const { error } = await client.from('explore_preferences').upsert({ ...input, user_id: userId }, { onConflict: 'user_id' });
      if (error) throw error; setPreferences(input); setNotice('Search preferences saved for your next visit.');
    } catch (err) { setError(message(err)); } finally { setBusy(false); }
  }
  async function changeOffer(listing: JobListing, state: ExploreOffer['state']) {
    if (!client || !userId || busy) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const input = listingSchema.parse(listing);
      const { data, error } = await client.from('explore_offers').upsert({ user_id: userId, provider: input.provider, provider_offer_id: input.providerId, listing: input, state }, { onConflict: 'user_id,provider,provider_offer_id' }).select('*').single();
      if (error) throw error;
      setOffers(previous => [data as ExploreOffer, ...previous.filter(offer => offer.id !== data.id)]);
      setNotice(state === 'saved' ? 'Offer saved. Choose Prepare application when you want to generate your CV and letter.' : state === 'dismissed' ? 'Offer dismissed. You can restore it from Dismissed.' : 'Offer restored to search results when it matches your search.');
    } catch (err) { setError(message(err)); } finally { setBusy(false); }
  }
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); if (!searching && !busy) void search(preferences); }
  const displayed = tab === 'results' ? visibleListings(results?.offers ?? [], offers, showDismissed) : offers.filter(offer => offer.state === tab).map(offer => offer.listing);
  return <>
    <Heading title="Explore offers" subtitle="Find opportunities in France, save a shortlist, then prepare your application."/>
    <Feedback error={loadError || error} notice={notice}/>
    {loadError && <button className="secondary" onClick={() => setAttempt(value => value + 1)}>Retry setup</button>}
    {loading ? <Loading>Loading your search preferences…</Loading> : !loadError && <>
      <form className="card mb-6 space-y-4" onSubmit={submit}><div className="grid gap-4 sm:grid-cols-2">
        <label className="label">Job title / keywords<input className="field" maxLength={200} value={preferences.keywords} onChange={event => setPreferences(value => ({ ...value, keywords: event.target.value }))} placeholder="Cybersécurité, développeur…"/></label>
        <label className="label">Location in France<input className="field" maxLength={200} value={preferences.location} onChange={event => setPreferences(value => ({ ...value, location: event.target.value }))} placeholder="Lyon, Paris or a postcode"/></label>
        <label className="label">Remote preference<select className="field" value={preferences.remote} onChange={event => setPreferences(value => ({ ...value, remote: event.target.value as ExplorePreferences['remote'] }))}>{Object.entries(remoteOptions).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label className="label">Contract type<select className="field" value={preferences.contract} onChange={event => setPreferences(value => ({ ...value, contract: event.target.value as ExplorePreferences['contract'] }))}>{Object.entries(contractOptions).map(([value,label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      </div><p className="text-xs leading-5 text-slate-500">Listings published within 30 days, newest first. Location searches use a 20 km radius. Remote preferences check explicit wording in each results page; unspecified arrangements are excluded when you choose a preference. Alternance and Stage use keyword searches. Always verify the original listing.</p>
      <div className="flex flex-wrap gap-3"><button className="button" disabled={searching || busy}><Search size={16}/>{searching ? 'Searching…' : 'Search offers'}</button><button type="button" className="secondary" disabled={busy || searching} onClick={savePreferences}>{busy ? 'Saving…' : 'Save preferences'}</button></div></form>
      <nav className="mb-4 flex flex-wrap gap-2" aria-label="Offer views">{(['results','saved','dismissed'] as const).map(value => <button key={value} aria-pressed={tab === value} className={tab === value ? 'button' : 'secondary'} onClick={() => setTab(value)}>{value === 'results' ? 'Search results' : value === 'saved' ? 'Saved offers' : 'Dismissed'}{value !== 'results' ? ` (${offers.filter(offer => offer.state === value).length})` : ''}</button>)}</nav>
      {tab === 'results' && <div className="mb-5 flex flex-wrap items-center justify-between gap-3 text-sm text-slate-500"><p>{results && searched ? `Page ${results.page} · ${searched.keywords || 'All roles'} · ${searched.location || 'France'} · checked ${new Date(results.fetchedAt).toLocaleTimeString()}` : 'Enter keywords or a location and search to see real offers.'}</p><label className="flex items-center gap-2"><input type="checkbox" checked={showDismissed} onChange={event => setShowDismissed(event.target.checked)}/>Show dismissed</label></div>}
      {tab !== 'results' && <p className="mb-5 text-sm text-slate-500">These are your saved snapshots, not a live availability check. Open the original listing to confirm it is still accepting applications.</p>}
      {searching && tab === 'results' ? <Loading>Searching Adzuna…</Loading> : !displayed.length ? <div className="card py-12 text-center"><h2 className="font-semibold">{tab === 'saved' ? 'No saved offers yet' : tab === 'dismissed' ? 'No dismissed offers' : 'No offers to show'}</h2><p className="mt-2 text-sm text-slate-500">{tab === 'results' ? 'Try broader keywords, a different location or Any work arrangement. There may be more matches on the next page.' : 'Use the actions on search results to build your shortlist.'}</p></div> : <div className="grid gap-4 lg:grid-cols-2">{displayed.map(listing => {
        const record = offers.find(offer => offer.provider_offer_id === listing.providerId);
        const applicationId = record ? applications[record.id] : undefined;
        return <article key={listing.providerId} className="card flex min-w-0 flex-col"><h2 className="break-words text-lg font-semibold">{listing.title}</h2><p className="mt-1 text-sm text-slate-600">{listing.company}</p><div className="my-4 flex flex-wrap gap-2 text-xs text-slate-600"><span>{listing.location}</span><span>· {listing.contract || 'Contract not specified'}</span><span>· {listing.remote === 'unknown' ? 'Work arrangement not specified' : remoteOptions[listing.remote]}</span></div><p className="mb-3 text-xs text-slate-500">{listing.publishedAt ? <>Published <time dateTime={listing.publishedAt}>{new Date(listing.publishedAt).toLocaleDateString()}</time></> : 'Publication date not supplied'}{record?.state === 'dismissed' ? ' · Dismissed' : record?.state === 'saved' ? ' · Saved' : ''}</p><details className="mb-4"><summary className="cursor-pointer text-sm text-slate-600">Description excerpt</summary><p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-slate-600">{listing.description}</p></details><div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs text-slate-400">Source</p><AdzunaAttribution/></div><a className="inline-flex items-center gap-1 text-sm font-medium text-indigo-600" href={listing.url} target="_blank" rel="noopener noreferrer">Original listing<ExternalLink size={14}/></a></div><div className="mt-auto flex flex-wrap gap-2">
          {record?.state === 'saved' ? <Link className="button" href={applicationId ? `/applications/${applicationId}` : `/applications/new?offer=${record.id}`}>{applicationId ? 'Open application' : 'Prepare application'}</Link> : <button className="button" disabled={busy} onClick={() => void changeOffer(listing, 'saved')}><Bookmark size={15}/>Save</button>}
          {record?.state === 'dismissed' ? <button className="secondary" disabled={busy} onClick={() => void changeOffer(listing, 'visible')}>Restore</button> : record?.state !== 'saved' && <button className="secondary" disabled={busy} onClick={() => void changeOffer(listing, 'dismissed')}>Dismiss</button>}
        </div></article>;
      })}</div>}
      {tab === 'results' && results && !searching && <div className="mt-6 flex items-center justify-between gap-3"><button className="secondary" disabled={results.page <= 1} onClick={() => void search(searched ?? preferences, results.page - 1)}>Previous page</button><span className="text-sm text-slate-500">Page {results.page}</span><button className="secondary" disabled={!results.hasMore} onClick={() => void search(searched ?? preferences, results.page + 1)}>Next page</button></div>}
      <p className="mt-6 text-xs leading-5 text-slate-500">Adzuna supplies excerpts, so the prepared application may have incomplete job requirements. Saving or dismissing never calls AI or sends an application. Generation happens only after you choose Analyze Offer.</p>
    </>}
  </>;
}
