import { z } from 'zod';
import { listingSchema, remoteWording, type ExplorePreferences, type ExploreSearchResult, type JobListing } from './explore';

export class ListingsError extends Error {
  constructor(message: string, public status: number) { super(message); }
}
const responseSchema = z.object({ count: z.number().nonnegative(), results: z.array(z.unknown()).max(100) });
const rawListing = z.object({
  id: z.union([z.string(), z.number()]), title: z.string(), description: z.string(),
  redirect_url: z.string(), created: z.string().optional(),
  company: z.object({ display_name: z.string().optional() }).optional(),
  location: z.object({ display_name: z.string().optional() }).optional(),
  contract_type: z.string().optional(), contract_time: z.string().optional(),
});
function plainText(value: string) {
  return value.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '').replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}
export function normalizeListing(value: unknown): JobListing | null {
  const parsed = rawListing.safeParse(value); if (!parsed.success) return null;
  const job = parsed.data; const description = plainText(job.description).slice(0, 20000);
  const date = job.created ? new Date(job.created) : null;
  const result = listingSchema.safeParse({
    provider: 'adzuna', providerId: String(job.id), title: plainText(job.title).slice(0,200),
    company: plainText(job.company?.display_name ?? '').slice(0,200) || 'Company not disclosed',
    location: plainText(job.location?.display_name ?? '').slice(0,300) || 'Location not disclosed',
    contract: [job.contract_type, job.contract_time].filter(Boolean).join(' · ').slice(0,100),
    publishedAt: date && !Number.isNaN(date.getTime()) ? date.toISOString() : null,
    url: job.redirect_url, description, remote: remoteWording(`${job.title} ${description}`),
  });
  return result.success ? result.data : null;
}
export function searchUrl(preferences: ExplorePreferences, page: number, appId: string, appKey: string) {
  const url = new URL(`https://api.adzuna.com/v1/api/jobs/fr/search/${page}`);
  url.searchParams.set('app_id', appId); url.searchParams.set('app_key', appKey);
  url.searchParams.set('results_per_page', '20'); url.searchParams.set('sort_by', 'date');
  url.searchParams.set('max_days_old', '30');
  let keywords = preferences.keywords;
  if (preferences.contract === 'apprenticeship') keywords += ' alternance';
  if (preferences.contract === 'internship') keywords += ' stage';
  if (keywords.trim()) url.searchParams.set('what', keywords.trim());
  if (preferences.location) { url.searchParams.set('where', preferences.location); url.searchParams.set('distance','20'); }
  if (['permanent','contract','full_time','part_time'].includes(preferences.contract)) url.searchParams.set(preferences.contract, '1');
  return url;
}
export async function searchAdzuna(preferences: ExplorePreferences, page: number): Promise<ExploreSearchResult> {
  const appId = process.env.ADZUNA_APP_ID, appKey = process.env.ADZUNA_APP_KEY;
  if (!appId || !appKey || /your-|YOUR_/.test(appId + appKey)) throw new ListingsError('Explore offers needs Adzuna credentials. Add ADZUNA_APP_ID and ADZUNA_APP_KEY to .env.local, then restart the app. See README.md.', 503);
  let response: Response;
  try {
    response = await fetch(searchUrl(preferences, page, appId, appKey), { headers: { Accept: 'application/json' }, cache: 'no-store', signal: AbortSignal.timeout(15000) });
  } catch { throw new ListingsError('The job listings service could not be reached. Try searching again later.', 502); }
  if (!response.ok) {
    if (response.status === 429) throw new ListingsError('Adzuna’s request limit was reached. Wait before searching again and check your API account quota.', 429);
    if ([401,403].includes(response.status)) throw new ListingsError('Adzuna rejected access. Check your application ID, key, and permission to use the France job search API.', 503);
    throw new ListingsError('The job listings service could not complete this search. Try again later.', 502);
  }
  let data: z.infer<typeof responseSchema>;
  try { data = responseSchema.parse(await response.json()); }
  catch { throw new ListingsError('The job listings service returned an unreadable response. Try again later.', 502); }
  const unique = new Map<string, JobListing>();
  for (const raw of data.results) { const offer = normalizeListing(raw); if (offer) unique.set(offer.providerId, offer); }
  const offers = [...unique.values()].filter(offer => preferences.remote === 'any' || offer.remote === preferences.remote);
  return { offers, page, hasMore: page < 50 && page * 20 < data.count, fetchedAt: new Date().toISOString() };
}
