import { ChatWorkspace } from '@/components/chat/ChatWorkspace';

export const metadata = { title: 'Conversation' };

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const { conversationId } = await params;
  // key: a different conversation starts from a fresh workspace.
  return <ChatWorkspace key={conversationId} initialConversationId={conversationId} />;
}
