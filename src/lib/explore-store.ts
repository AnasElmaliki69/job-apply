import type { SupabaseClient } from '@supabase/supabase-js';
import type { ExploreOffer } from './explore';

// Read every saved/dismissed identity, not just Supabase's default first page.
// Otherwise older dismissed offers could unexpectedly reappear in search results.
export async function loadExploreOffers(client: SupabaseClient, userId: string): Promise<ExploreOffer[]> {
  const offers: ExploreOffer[] = []; let after: string | null = null;
  for (;;) {
    let query = client.from('explore_offers').select('*').eq('user_id',userId).order('id').limit(500);
    if (after) query = query.gt('id',after);
    const { data, error } = await query;
    if (error) throw error;
    const page = (data ?? []) as ExploreOffer[]; offers.push(...page);
    if (page.length < 500) return offers.sort((a,b) => b.updated_at.localeCompare(a.updated_at));
    after = page[page.length - 1].id;
  }
}
