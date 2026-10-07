'use client';

import { Button } from './Button';
import { Icon } from './Icon';

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
      className="flex flex-col items-center gap-2 rounded-2xl border border-rose-200 bg-rose-50/70 px-6 py-8 text-center"
    >
      <span className="mb-1 grid h-10 w-10 place-items-center rounded-xl bg-rose-100 text-rose-600">
        <Icon name="alert" />
      </span>
      <p className="text-sm font-semibold text-rose-900">{title}</p>
      {message && <p className="max-w-md text-sm text-rose-800">{message}</p>}
      {requestId && (
        <p className="text-xs text-rose-700">
          Request ID: <code className="font-mono">{requestId}</code>
        </p>
      )}
      {onRetry && (
        <Button variant="secondary" className="mt-2" onClick={onRetry}>
          <Icon name="refresh" className="h-4 w-4" />
          Retry
        </Button>
      )}
    </div>
  );
}
