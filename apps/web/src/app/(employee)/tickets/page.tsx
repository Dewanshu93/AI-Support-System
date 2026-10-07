import { Suspense } from 'react';
import { MyTickets } from '@/components/tickets/MyTickets';

export const metadata = { title: 'My tickets' };

export default function MyTicketsPage() {
  // useSearchParams (status filter) needs a Suspense boundary.
  return (
    <Suspense>
      <MyTickets />
    </Suspense>
  );
}
