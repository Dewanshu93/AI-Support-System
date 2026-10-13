'use client';

import { type AgentTicketDetailResponse, PRIORITIES, type Priority } from '@sd/shared';
import { useState } from 'react';
import { priorityLabel } from '@/components/chat/TicketDraftCard';
import { Button } from '@/components/ui/Button';
import { type Classification, classificationChange } from '@/lib/agentTicket';

type Options = AgentTicketDetailResponse['categoryOptions'];

const SELECT =
  'h-9 w-full rounded-lg border border-slate-300 bg-surface px-2.5 text-sm text-slate-900 focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10 focus:outline-none disabled:bg-slate-50 disabled:text-slate-500';

/**
 * Correct the category, subcategory or priority. Saves only what changed; the API
 * re-routes on a new category and records each correction (override rate).
 */
export function ClassificationEditor({
  current,
  options,
  restricted,
  busy,
  onSave,
}: {
  current: Classification;
  options: Options;
  restricted: boolean;
  busy: boolean;
  onSave: (change: NonNullable<ReturnType<typeof classificationChange>>) => void;
}) {
  const [edit, setEdit] = useState<Classification>(current);
  const category = options.find((c) => c.id === edit.category);
  const change = classificationChange(current, edit);

  return (
    <form
      data-testid="classification-editor"
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (change) onSave(change);
      }}
    >
      <label className="block space-y-1 text-xs font-medium text-slate-600">
        Category
        <select
          data-testid="classification-category"
          value={edit.category}
          disabled={busy || restricted}
          onChange={(e) => setEdit({ ...edit, category: e.target.value, subcategory: null })}
          className={SELECT}
        >
          {(['IT', 'HR'] as const).map((domain) => (
            <optgroup key={domain} label={domain}>
              {options
                .filter((c) => c.domain === domain)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
      </label>
      {restricted && (
        <p className="text-xs text-slate-500">A confidential case keeps its category and queue.</p>
      )}
      <label className="block space-y-1 text-xs font-medium text-slate-600">
        Subcategory
        <select
          data-testid="classification-subcategory"
          value={edit.subcategory ?? ''}
          disabled={busy}
          onChange={(e) => setEdit({ ...edit, subcategory: e.target.value || null })}
          className={SELECT}
        >
          <option value="">None</option>
          {category?.subcategories.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </label>
      <label className="block space-y-1 text-xs font-medium text-slate-600">
        Priority
        <select
          data-testid="classification-priority"
          value={edit.priority}
          disabled={busy}
          onChange={(e) => setEdit({ ...edit, priority: e.target.value as Priority })}
          className={SELECT}
        >
          {PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {priorityLabel(p)}
            </option>
          ))}
        </select>
      </label>
      <div className="flex items-center gap-2">
        <Button
          type="submit"
          size="sm"
          data-testid="classification-save"
          disabled={busy || !change}
        >
          {busy ? 'Saving…' : 'Save correction'}
        </Button>
        {change && (
          <Button type="button" size="sm" variant="ghost" onClick={() => setEdit(current)}>
            Undo
          </Button>
        )}
      </div>
      {change?.category && (
        <p className="text-xs text-amber-800">
          A new category may move the ticket to another team&apos;s queue.
        </p>
      )}
    </form>
  );
}
