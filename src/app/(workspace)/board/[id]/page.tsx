import BoardDetail from '@/components/board-detail';
export default async function BoardCardPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ fromProject?: string }> }) {
  const { id } = await params;
  const { fromProject } = await searchParams;
  return <BoardDetail key={id} id={id} fromProject={typeof fromProject === 'string' ? fromProject : undefined}/>;
}
