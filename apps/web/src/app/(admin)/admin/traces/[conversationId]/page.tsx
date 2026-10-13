import { TraceViewer } from '@/components/admin/traces/TraceViewer';

export const metadata = { title: 'Conversation trace' };

export default async function ConversationTracePage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const { conversationId } = await params;
  return <TraceViewer conversationId={conversationId} />;
}
