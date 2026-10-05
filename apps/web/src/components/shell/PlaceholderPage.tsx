import { EmptyState } from '@/components/ui/EmptyState';

/** Stand-in for a screen that a later playbook task builds. */
export function PlaceholderPage({
  title,
  description,
  task,
}: {
  title: string;
  description: string;
  task: string;
}) {
  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
      <EmptyState title="Not built yet" description={`${description} Arrives in ${task}.`} />
    </section>
  );
}
