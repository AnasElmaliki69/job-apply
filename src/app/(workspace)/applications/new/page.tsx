import AddOffer from '@/components/add-offer';
export default async function AddOfferPage({ searchParams }: { searchParams: Promise<{ offer?: string | string[] }> }) {
  const params = await searchParams;
  return <AddOffer key={String(params.offer ?? 'manual')} offerId={typeof params.offer === 'string' ? params.offer : undefined}/>;
}
