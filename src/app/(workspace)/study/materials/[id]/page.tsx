import StudyMaterialPage from '@/components/study-material';
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; return <StudyMaterialPage key={id} id={id}/>;
}
