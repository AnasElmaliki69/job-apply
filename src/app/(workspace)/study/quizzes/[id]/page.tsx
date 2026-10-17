import StudyQuizPage from '@/components/study-quiz';
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; return <StudyQuizPage key={id} id={id}/>;
}
