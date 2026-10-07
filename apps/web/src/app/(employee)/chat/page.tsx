import { ChatWorkspace } from '@/components/chat/ChatWorkspace';

export const metadata = { title: 'Copilot' };

/** `/chat?q=…` (dashboard, command palette) starts a conversation with that question. */
export default async function ChatPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  const { q } = await searchParams;
  const prompt = typeof q === 'string' ? q.trim().slice(0, 2000) : '';
  return <ChatWorkspace key={prompt} initialPrompt={prompt || undefined} />;
}
