import { Icon } from '@/components/ui/Icon';

/** Board / list switch. */
export function ViewToggle({
  value,
  onChange,
}: {
  value: 'board' | 'list';
  onChange: (v: 'board' | 'list') => void;
}) {
  const option = (v: 'board' | 'list', label: string, icon: 'board' | 'list') => (
    <button
      type="button"
      aria-pressed={value === v}
      onClick={() => onChange(v)}
      className={`inline-flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-medium transition ${
        value === v ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
      }`}
    >
      <Icon name={icon} className="h-4 w-4" />
      {label}
    </button>
  );
  return (
    <div role="group" aria-label="View" className="inline-flex rounded-lg bg-slate-200/70 p-1">
      {option('board', 'Board', 'board')}
      {option('list', 'List', 'list')}
    </div>
  );
}
