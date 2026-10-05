'use client';

import { Button } from './Button';

/** Error state with retry and the request ID for support (playbook section 10). */
export function ErrorState({
  title = 'Something went wrong',
  message,
  requestId,
  onRetry,
}: {
  title?: string;
  message?: string;
  requestId?: string;
  onRetry?: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-6 py-8 text-center"
    >
      <p className="text-sm font-semibold text-rose-900">{title}</p>
      {message && <p className="max-w-md text-sm text-rose-800">{message}</p>}
      {requestId && (
        <p className="text-xs text-rose-700">
          Request ID: <code className="font-mono">{requestId}</code>
        </p>
      )}
      {onRetry && (
        <Button variant="secondary" className="mt-2" onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  );
}
