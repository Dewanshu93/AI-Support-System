import { Suspense } from 'react';
import { AdminOverview } from '@/components/admin/overview/AdminOverview';

export const metadata = { title: 'Overview' };

export default function OverviewPage() {
  // useSearchParams (date range) needs a Suspense boundary.
  return (
    <Suspense>
      <AdminOverview />
    </Suspense>
  );
}
