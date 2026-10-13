import { AgentTicketDetail } from '@/components/agent/AgentTicketDetail';

export const metadata = { title: 'Ticket' };

export default async function AgentTicketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AgentTicketDetail key={id} id={id} />;
}
