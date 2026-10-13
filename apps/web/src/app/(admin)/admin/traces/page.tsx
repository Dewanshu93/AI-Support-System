import { Suspense } from 'react';
import { ConversationTable } from '@/components/admin/traces/ConversationTable';

export const metadata = { title: 'Traces' };

export default function TracesPage() {
  // useSearchParams (filters) needs a Suspense boundary.
  return (
    <Suspense>
      <ConversationTable />
    </Suspense>
  );
}
