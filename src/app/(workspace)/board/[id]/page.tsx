import BoardDetail from '@/components/board-detail';
export default async function BoardCardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <BoardDetail id={id}/>;
}
