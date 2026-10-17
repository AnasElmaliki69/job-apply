import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeListing, searchAdzuna, searchUrl } from '../src/lib/adzuna';
import { searchSchema, defaultPreferences, listingText, remoteWording, visibleListings, type ExploreOffer } from '../src/lib/explore';
import { GET } from '../src/app/api/offers/route';
import { createClient } from '@supabase/supabase-js';
import { loadExploreOffers } from '../src/lib/explore-store';
const raw = { id: '12345', title: 'Analyste <b>cybersécurité</b>', description: 'Audit &amp; réseaux. Télétravail possible.', company: { display_name: 'Example' }, location: { display_name: 'Lyon' }, redirect_url: 'https://www.adzuna.fr/jobs/land/ad/12345?utm_source=test', created: '2026-10-14T10:00:00Z', contract_type: 'permanent' };
test('search validates France preferences and builds only documented parameters', () => {
  assert.equal(searchSchema.safeParse({ ...defaultPreferences }).success,false);
  assert.equal(searchSchema.safeParse({ ...defaultPreferences, keywords: 'Développeur', page: -1 }).success,false);
  assert.equal(searchSchema.safeParse({ ...defaultPreferences, keywords: 'Dev', page: '2' }).success,true);
  const url = searchUrl({ keywords: 'Sécurité', location: 'Lyon', remote: 'remote', contract: 'permanent' },2,'test-id','test-key');
  assert.equal(url.pathname,'/v1/api/jobs/fr/search/2');
  assert.equal(url.searchParams.get('permanent'),'1');
  assert.equal(url.searchParams.get('where'),'Lyon');
  assert.equal(url.searchParams.get('distance'),'20');
  assert.equal(url.searchParams.get('max_days_old'),'30');
  assert.equal(url.searchParams.has('remote'),false);
  assert.equal(searchUrl({ ...defaultPreferences, contract: 'apprenticeship' },1,'id','key').searchParams.get('what'),'alternance');
});
test('provider results become plain safe attributed excerpts, never fabricated offers', () => {
  const listing = normalizeListing(raw)!;
  assert.equal(listing.title,'Analyste cybersécurité'); assert.equal(listing.remote,'remote');
  assert.match(listingText(listing),/Source : Adzuna/);
  assert.match(listingText(listing),/potentiellement incomplet/);
  assert.equal(normalizeListing({ ...raw, redirect_url: 'javascript:alert(1)' }),null);
  assert.equal(normalizeListing({ ...raw, redirect_url: 'https://evil.example/jobs' }),null);
  assert.equal(normalizeListing({ ...raw, redirect_url: 'https://www.adzuna.fr/jobs?app_key=private' }),null);
  assert.equal(normalizeListing({ ...raw, description: '' }),null);
  assert.equal(normalizeListing({ ...raw, company: undefined, created: 'bad date' })?.company,'Company not disclosed');
  assert.equal(normalizeListing({ ...raw, created: 'bad date' })?.publishedAt,null);
  assert.equal(remoteWording('Aucun détail indiqué'),'unknown');
  assert.equal(remoteWording('Pas de télétravail'),'onsite');
});
test('dismissed IDs remain hidden across searches until explicitly shown or restored', () => {
  const listing = normalizeListing(raw)!;
  const state = { id: 'saved-id', provider_offer_id: listing.providerId, state: 'dismissed', listing } as ExploreOffer;
  assert.equal(visibleListings([listing],[state],false).length,0);
  assert.equal(visibleListings([listing],[state],true).length,1);
  assert.equal(visibleListings([listing],[{ ...state, state: 'visible' }],false).length,1);
});
test('missing credentials and provider errors never expose secrets or pretend to return results', async () => {
  const beforeId = process.env.ADZUNA_APP_ID, beforeKey = process.env.ADZUNA_APP_KEY, original = globalThis.fetch;
  try {
    delete process.env.ADZUNA_APP_ID; delete process.env.ADZUNA_APP_KEY;
    await assert.rejects(searchAdzuna({ ...defaultPreferences, keywords: 'Dev' },1),/needs Adzuna credentials/);
    process.env.ADZUNA_APP_ID = 'test-id'; process.env.ADZUNA_APP_KEY = 'private-key';
    globalThis.fetch = async () => Response.json({ error: 'private-key' },{ status: 429 });
    await assert.rejects(searchAdzuna({ ...defaultPreferences, keywords: 'Dev' },1),error => error instanceof Error && /request limit/.test(error.message) && !error.message.includes('private-key'));
    globalThis.fetch = async () => { throw new Error('private-key'); };
    await assert.rejects(searchAdzuna({ ...defaultPreferences, keywords: 'Dev' },1),/could not be reached/);
    globalThis.fetch = async (input, init) => {
      assert.equal(init?.cache,'no-store');
      assert.equal(new URL(String(input)).searchParams.get('app_key'),'private-key');
      return Response.json({ count: 60, results: [raw,raw,{ ...raw, id: 'second', description: 'Présentiel obligatoire.' }] });
    };
    const result = await searchAdzuna({ ...defaultPreferences, keywords: 'Dev', remote: 'remote' },1);
    assert.equal(result.offers.length,1); assert.equal(result.hasMore,true);
    assert.ok(!JSON.stringify(result).includes('private-key'));
  } finally {
    globalThis.fetch = original;
    if (beforeId === undefined) delete process.env.ADZUNA_APP_ID; else process.env.ADZUNA_APP_ID = beforeId;
    if (beforeKey === undefined) delete process.env.ADZUNA_APP_KEY; else process.env.ADZUNA_APP_KEY = beforeKey;
  }
});
test('anonymous searches never reach Supabase or the job provider', async () => {
  const original = globalThis.fetch; globalThis.fetch = async () => { throw new Error('Must not call'); };
  try { const response = await GET(new Request('http://localhost/api/offers')); assert.equal(response.status,401); assert.equal(response.headers.get('cache-control'),'no-store'); }
  finally { globalThis.fetch = original; }
});
test('older dismissed offers remain hidden beyond the database default page limit', async () => {
  const original=globalThis.fetch; let reads=0;
  const records=Array.from({length:1101},(_,index)=>({id:String(index).padStart(4,'0'),provider_offer_id:String(index),state:'dismissed',updated_at:'2026-10-14'}));
  globalThis.fetch=async input=>{
    const params=new URL(String(input)).searchParams; assert.equal(params.get('user_id'),'eq.user-a');
    const after=params.get('id')?.replace('gt.',''); reads++;
    return Response.json(records.filter(record=>!after || record.id>after).slice(0,500));
  };
  try {
    const client=createClient('https://test.supabase.co','fake-public',{auth:{persistSession:false,autoRefreshToken:false}});
    const all=await loadExploreOffers(client,'user-a'); assert.equal(all.length,1101); assert.equal(reads,3);
    const listing={...normalizeListing(raw)!,providerId:'1100'};
    assert.equal(visibleListings([listing],all,false).length,0);
  } finally {globalThis.fetch=original;}
});
