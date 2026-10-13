'use client';

import type { AgentDraftReplyResponse } from '@sd/shared';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';

export type ComposerMode = 'reply' | 'note';
type Draft = AgentDraftReplyResponse['draft'];

/**
 * Reply to the employee (public) or add an internal note. "Generate draft" (P-7,
 * reply mode only) fills the text box; the agent edits it and sends it as their
 * own reply. Nothing is sent without the Send click.
 */
export function ReplyComposer({
  busy,
  aiAvailable,
  onGenerate,
  onSend,
}: {
  busy: boolean;
  /** False for confidential cases: no AI on sensitive topics. */
  aiAvailable: boolean;
  onGenerate: (tone: 'standard' | 'brief') => Promise<Draft | null>;
  onSend: (mode: ComposerMode, body: string, usedAiDraft: boolean) => Promise<boolean>;
}) {
  const [mode, setMode] = useState<ComposerMode>('reply');
  const [body, setBody] = useState('');
  const [tone, setTone] = useState<'standard' | 'brief'>('standard');
  const [generating, setGenerating] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);

  const generate = async () => {
    setGenerating(true);
    try {
      const next = await onGenerate(tone);
      if (next) {
        setDraft(next);
        setBody(next.body);
      }
    } finally {
      setGenerating(false);
    }
  };

  const send = async () => {
    const sent = await onSend(mode, body.trim(), mode === 'reply' && draft !== null);
    if (sent) {
      setBody('');
      setDraft(null);
    }
  };

  return (
    <section
      aria-label="Reply"
      data-testid="reply-composer"
      className="space-y-3 rounded-2xl border border-slate-200/80 bg-surface p-4 shadow-card"
    >
      <div role="tablist" aria-label="Message type" className="flex gap-1">
        {(['reply', 'note'] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            data-testid={`composer-${m}`}
            onClick={() => setMode(m)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
              mode === m ? 'bg-ink text-on-ink' : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            {m === 'reply' ? 'Reply to employee' : 'Internal note'}
          </button>
        ))}
      </div>

      {mode === 'reply' && aiAvailable && (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="ai"
            size="sm"
            data-testid="generate-draft"
            disabled={busy || generating}
            onClick={() => void generate()}
          >
            <Icon name="sparkles" className="h-3.5 w-3.5" />
            {generating ? 'Drafting…' : draft ? 'Regenerate draft' : 'Generate draft'}
          </Button>
          <label className="flex items-center gap-1.5 text-xs text-slate-600">
            Tone
            <select
              data-testid="draft-tone"
              value={tone}
              onChange={(e) => setTone(e.target.value as 'standard' | 'brief')}
              className="h-8 rounded-lg border border-slate-300 bg-surface px-2 text-xs"
            >
              <option value="standard">Standard</option>
              <option value="brief">Brief</option>
            </select>
          </label>
        </div>
      )}

      <label className="block">
        <span className="sr-only">{mode === 'reply' ? 'Reply' : 'Note'}</span>
        <textarea
          data-testid="composer-body"
          rows={7}
          value={body}
          maxLength={5000}
          onChange={(e) => setBody(e.target.value)}
          placeholder={
            mode === 'reply'
              ? 'Write to the employee. They see this reply on their request.'
              : 'Visible to agents only.'
          }
          className={`w-full rounded-lg border px-3 py-2 text-sm leading-relaxed focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10 focus:outline-none ${
            mode === 'note' ? 'border-amber-300 bg-amber-50/40' : 'border-slate-300 bg-surface'
          }`}
        />
      </label>

      {mode === 'reply' && draft && (
        <div data-testid="draft-notice" className="space-y-1 text-xs text-slate-600">
          <p>
            AI draft: check it and fill any [placeholders] before sending. It is sent only when you
            click Send.
          </p>
          {draft.citedDocuments.length > 0 && (
            <p>Based on: {draft.citedDocuments.map((d) => d.docTitle).join(', ')}</p>
          )}
        </div>
      )}

      <div className="flex justify-end">
        <Button
          data-testid="composer-send"
          disabled={busy || !body.trim() || (mode === 'reply' && /\[[^\]]+\]/.test(body))}
          onClick={() => void send()}
        >
          {busy ? 'Sending…' : mode === 'reply' ? 'Send reply' : 'Add note'}
        </Button>
      </div>
      {mode === 'reply' && /\[[^\]]+\]/.test(body) && (
        <p className="text-right text-xs text-amber-800">
          Fill or remove the [placeholders] before sending.
        </p>
      )}
    </section>
  );
}
