import { TicketDetail } from '@/components/tickets/TicketDetail';

export const metadata = { title: 'Ticket' };

export default async function TicketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TicketDetail key={id} id={id} />;
}
