import { z } from 'zod';

export const contractOptions = { any: 'Any contract', permanent: 'Permanent / CDI', contract: 'Contract / temporary', full_time: 'Full time', part_time: 'Part time', apprenticeship: 'Alternance (keyword)', internship: 'Stage (keyword)' } as const;
export const remoteOptions = { any: 'Any work arrangement', remote: 'Remote mentioned', onsite: 'On-site mentioned' } as const;
export const preferencesSchema = z.object({
  keywords: z.string().trim().max(200), location: z.string().trim().max(200),
  remote: z.enum(['any','remote','onsite']),
  contract: z.enum(['any','permanent','contract','full_time','part_time','apprenticeship','internship']),
}).strict();
export type ExplorePreferences = z.infer<typeof preferencesSchema>;
export const defaultPreferences: ExplorePreferences = { keywords: '', location: '', remote: 'any', contract: 'any' };
export const searchSchema = preferencesSchema.extend({ page: z.coerce.number().int().min(1).max(50).default(1) }).refine(value => !!(value.keywords || value.location), { message: 'Enter keywords or a location to search.', path: ['keywords'] });

export function safeListingUrl(value: string) {
  try {
    const url = new URL(value);
    return ['http:','https:'].includes(url.protocol) && !url.username && !url.password &&
      ['adzuna.fr','www.adzuna.fr','adzuna.co.uk','www.adzuna.co.uk'].includes(url.hostname) &&
      ![...url.searchParams.keys()].some(key => /key|secret|token/i.test(key));
  } catch { return false; }
}
export const listingSchema = z.object({
  provider: z.literal('adzuna'), providerId: z.string().regex(/^[A-Za-z0-9_-]{1,100}$/),
  title: z.string().min(1).max(200), company: z.string().min(1).max(200),
  location: z.string().min(1).max(300), contract: z.string().max(100),
  publishedAt: z.iso.datetime({ offset: true }).nullable(),
  url: z.string().max(4000).refine(safeListingUrl),
  description: z.string().min(1).max(20000), remote: z.enum(['unknown','remote','onsite']),
}).strict();
export type JobListing = z.infer<typeof listingSchema>;
export type ExploreOffer = { id: string; user_id: string; provider: 'adzuna'; provider_offer_id: string; state: 'saved' | 'dismissed' | 'visible'; listing: JobListing; created_at: string; updated_at: string };
export type ExploreSearchResult = { offers: JobListing[]; page: number; hasMore: boolean; fetchedAt: string };
export function listingText(offer: JobListing) {
  return `${offer.title}\nEntreprise : ${offer.company}\nLieu : ${offer.location}\nContrat : ${offer.contract || 'Non précisé'}\nSource : Adzuna\nAnnonce originale : ${offer.url}\n\nExtrait de l’annonce fourni par Adzuna (texte potentiellement incomplet) :\n${offer.description}`;
}
export function remoteWording(text: string): JobListing['remote'] {
  const plain = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (/pas de teletravail|sans teletravail|no remote|on[- ]site only|presentiel (?:uniquement|obligatoire)/.test(plain)) return 'onsite';
  if (/\bteletravail\b|\bremote\b|work from home/.test(plain)) return 'remote';
  if (/\b(on[- ]site|presentiel)\b/.test(plain)) return 'onsite';
  return 'unknown';
}
export function visibleListings(offers: JobListing[], states: ExploreOffer[], showDismissed: boolean) {
  const dismissed = new Set(states.filter(offer => offer.state === 'dismissed').map(offer => offer.provider_offer_id));
  return offers.filter(offer => showDismissed || !dismissed.has(offer.providerId));
}
