import { Suspense } from 'react';
import { AgentQueue } from '@/components/agent/AgentQueue';

export const metadata = { title: 'Queue' };

export default function QueuePage() {
  // useSearchParams (filters) needs a Suspense boundary.
  return (
    <Suspense>
      <AgentQueue />
    </Suspense>
  );
}
