import { Suspense } from 'react';
import { DocumentTable } from '@/components/admin/documents/DocumentTable';

export const metadata = { title: 'Documents' };

export default function DocumentsPage() {
  // useSearchParams (filters) needs a Suspense boundary.
  return (
    <Suspense>
      <DocumentTable />
    </Suspense>
  );
}
