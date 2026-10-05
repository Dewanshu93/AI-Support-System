/** Loading placeholder; every page shows a skeleton while data loads (playbook section 10). */
export function Skeleton({ className = 'h-4 w-full' }: { className?: string }) {
  return (
    <div aria-hidden="true" className={`animate-pulse rounded-md bg-slate-200 ${className}`} />
  );
}

export function SkeletonCards({
  count = 3,
  label = 'Loading',
}: {
  count?: number;
  label?: string;
}) {
  return (
    <div role="status" aria-label={label} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="space-y-3 rounded-lg border border-slate-200 bg-white p-4">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-3 w-1/2" />
          <Skeleton className="h-5 w-24" />
        </div>
      ))}
    </div>
  );
}
