import { EvalRunDetail } from '@/components/admin/evals/EvalRunDetail';

export const metadata = { title: 'Evaluation run' };

export default async function EvalRunPage({ params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  return <EvalRunDetail runId={runId} />;
}
