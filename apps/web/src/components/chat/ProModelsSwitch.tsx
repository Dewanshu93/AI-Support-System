'use client';

import { useEffect, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { api } from '@/lib/api';

/** Tooltip and screen-reader description of each setting (ADR-020). */
export const PRO_HINT = {
  on: 'Pro is on: answers use paid cloud models (Gemini, OpenRouter).',
  off: 'Pro is off: answers use the local model (Ollama). Free, but slower.',
} as const;

/**
 * The user's own "Pro" switch in the Copilot header (ADR-020). Saved on the
 * account, so it applies to every copilot turn, confirmation and draft made for
 * them, in any browser. Disabled until the current setting has loaded.
 */
export function ProModelsSwitch() {
  const [on, setOn] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    api.me().then(
      (user) => live && setOn(user.proModels),
      () => live && setFailed(true),
    );
    return () => {
      live = false;
    };
  }, []);

  async function toggle() {
    if (on === null || saving) return;
    const next = !on;
    setSaving(true);
    setFailed(false);
    setOn(next); // optimistic; reverted if saving fails
    try {
      setOn((await api.setPreferences({ proModels: next })).proModels);
    } catch {
      setOn(!next);
      setFailed(true);
    } finally {
      setSaving(false);
    }
  }

  const hint = on ? PRO_HINT.on : PRO_HINT.off;
  return <ProModelsView on={on} saving={saving} failed={failed} hint={hint} onToggle={toggle} />;
}

/** Presentational switch (rendered statically in tests). */
export function ProModelsView({
  on,
  saving,
  failed,
  hint,
  onToggle,
}: {
  on: boolean | null;
  saving: boolean;
  failed: boolean;
  hint: string;
  onToggle: () => void;
}) {
  return (
    <div className="ml-auto flex shrink-0 items-center gap-2" title={hint}>
      {failed && (
        <span role="alert" className="text-xs text-rose-700">
          Could not save
        </span>
      )}
      <span id="pro-models-hint" className="sr-only">
        {hint}
      </span>
      <button
        type="button"
        role="switch"
        data-testid="pro-models-switch"
        aria-checked={on === true}
        aria-describedby="pro-models-hint"
        disabled={on === null || saving}
        onClick={onToggle}
        className={`group flex h-8 items-center gap-2 rounded-full border pr-1 pl-2.5 text-xs font-semibold transition disabled:opacity-60 ${
          on
            ? 'border-brand-200 bg-brand-50 text-brand-700'
            : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
        }`}
      >
        <Icon
          name="sparkles"
          className={`h-3.5 w-3.5 ${on ? 'text-brand-600' : 'text-slate-400'}`}
        />
        Pro
        <span
          aria-hidden="true"
          className={`relative h-5 w-9 rounded-full transition-colors ${on ? 'bg-brand-600' : 'bg-slate-300'}`}
        >
          <span
            className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-[left] ${on ? 'left-4.5' : 'left-0.5'}`}
          />
        </span>
      </button>
    </div>
  );
}
