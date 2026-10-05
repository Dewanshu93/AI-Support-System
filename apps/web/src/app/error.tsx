'use client';

import { useEffect } from 'react';
import { ErrorState } from '@/components/ui/ErrorState';

/** Route error boundary (Next 16 passes `retry`). Server errors expose only a digest. */
export default function RouteError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto max-w-xl px-4 py-16">
      <ErrorState
        title="The service is unavailable"
        message="We could not load this page. Check that the API is running, then retry."
        requestId={error.digest}
        onRetry={retry}
      />
    </main>
  );
}
