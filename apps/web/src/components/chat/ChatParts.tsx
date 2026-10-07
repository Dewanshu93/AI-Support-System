'use client';

// Smaller chat pieces: stage indicator, composer, resolution prompt, feedback,
// empty state with example prompts.
import type { ChatStage } from '@sd/shared';
import { type FormEvent, type KeyboardEvent, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Spinner } from '@/components/ui/Spinner';

const STAGE_TEXT: Record<ChatStage, string> = {
  analyzing: 'Understanding your question…',
  searching: 'Searching company policies…',
  writing: 'Writing the answer…',
  preparing_ticket: 'Preparing a ticket…',
};

export function StageIndicator({ stage }: { stage: ChatStage | null }) {
  return (
    <div
      data-testid="stage-indicator"
      data-stage={stage ?? 'sending'}
      className="flex items-center gap-2 text-sm text-slate-600"
    >
      <Spinner label="Working" />
      <span>{stage ? STAGE_TEXT[stage] : 'Sending…'}</span>
    </div>
  );
}

export const MAX_MESSAGE_LENGTH = 2000;

export function Composer({
  disabled,
  onSend,
  onEscalate,
}: {
  disabled: boolean;
  onSend: (text: string) => void;
  onEscalate: () => void;
}) {
  const [text, setText] = useState('');
  const trimmed = text.trim();
  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    if (disabled || !trimmed || trimmed.length > MAX_MESSAGE_LENGTH) return;
    onSend(trimmed);
    setText('');
  };
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) submit(e);
  };
  return (
    <form
      onSubmit={submit}
      className="space-y-2 rounded-xl border border-slate-300 bg-white p-2 transition focus-within:border-brand-500 focus-within:ring-4 focus-within:ring-brand-500/10"
    >
      <label htmlFor="composer" className="sr-only">
        Your message
      </label>
      <textarea
        id="composer"
        data-testid="composer"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
        rows={2}
        maxLength={MAX_MESSAGE_LENGTH}
        placeholder="Ask about your timesheet, pay, policies or requests…"
        className="w-full resize-none bg-transparent px-2 py-1.5 text-sm text-slate-900 placeholder:text-slate-500 focus:outline-none"
      />
      <div className="flex items-center justify-between gap-2">
        <Button
          variant="ghost"
          data-testid="talk-to-human"
          disabled={disabled}
          onClick={onEscalate}
        >
          Talk to a human
        </Button>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-500">
            {trimmed.length}/{MAX_MESSAGE_LENGTH}
          </span>
          <Button type="submit" data-testid="send" disabled={disabled || !trimmed}>
            Send
          </Button>
        </div>
      </div>
    </form>
  );
}

export function ResolutionPrompt({
  busy,
  onAnswer,
}: {
  busy: boolean;
  onAnswer: (resolved: boolean) => void;
}) {
  return (
    <div
      data-testid="resolution-prompt"
      className="flex flex-wrap items-center gap-2 text-sm text-slate-700"
    >
      <span>Did this solve your question?</span>
      <Button
        variant="secondary"
        data-testid="resolved-yes"
        disabled={busy}
        onClick={() => onAnswer(true)}
      >
        Yes, solved
      </Button>
      <Button
        variant="secondary"
        data-testid="resolved-no"
        disabled={busy}
        onClick={() => onAnswer(false)}
      >
        No
      </Button>
    </div>
  );
}

export function FeedbackButtons({
  value,
  onRate,
}: {
  value: 'up' | 'down' | null;
  onRate: (rating: 'up' | 'down') => void;
}) {
  const style = (active: boolean) =>
    `rounded px-2 py-1 text-xs ring-1 ring-inset ${active ? 'bg-slate-900 text-white ring-slate-900' : 'text-slate-600 ring-slate-200 hover:bg-slate-100'}`;
  return (
    <div data-testid="feedback" className="flex items-center gap-1" aria-label="Rate this reply">
      <button
        type="button"
        data-testid="feedback-up"
        aria-pressed={value === 'up'}
        className={style(value === 'up')}
        onClick={() => onRate('up')}
      >
        Helpful
      </button>
      <button
        type="button"
        data-testid="feedback-down"
        aria-pressed={value === 'down'}
        className={style(value === 'down')}
        onClick={() => onRate('down')}
      >
        Not helpful
      </button>
    </div>
  );
}

export const EXAMPLE_PROMPTS = [
  'How many days of annual leave do I get?',
  'My VPN keeps disconnecting. What should I do?',
  'What is the Loss of Pay policy?',
  'When do I need to submit my timesheet?',
];

export function EmptyChat({ onPick }: { onPick: (prompt: string) => void }) {
  return (
    <div data-testid="empty-chat" className="flex flex-col items-center gap-4 py-10 text-center">
      <div>
        <p className="text-lg font-semibold text-slate-900">How can I help?</p>
        <p className="text-sm text-slate-600">
          Ask about policies, your pay or your requests. Answers come from company policy, with
          sources cited.
        </p>
      </div>
      <div className="grid w-full max-w-xl gap-2 sm:grid-cols-2">
        {EXAMPLE_PROMPTS.map((prompt) => (
          <button
            key={prompt}
            type="button"
            onClick={() => onPick(prompt)}
            className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-left text-sm text-slate-800 transition hover:border-brand-200 hover:bg-brand-50/50"
          >
            {prompt}
          </button>
        ))}
      </div>
    </div>
  );
}
