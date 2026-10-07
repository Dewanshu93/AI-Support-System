'use client';

import { useRouter } from 'next/navigation';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { Icon, type IconName } from '@/components/ui/Icon';
import { COPILOT_SUGGESTIONS, copilotHref, type PromptSuggestion } from '@/lib/copilot';

const GROUP_ICON: Record<PromptSuggestion['group'], IconName> = {
  Timesheets: 'clock',
  Pay: 'wallet',
  Policies: 'file',
  Requests: 'inbox',
};

/** Command palette that opens the copilot with a question (Ctrl/⌘ K). */
export function CopilotPalette({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [text, setText] = useState('');
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const matches = COPILOT_SUGGESTIONS.filter((s) =>
    s.text.toLowerCase().includes(text.trim().toLowerCase()),
  );

  useEffect(() => {
    input.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  useEffect(() => setActive(0), [text]);

  const ask = (question: string) => {
    const q = question.trim();
    if (!q) return;
    onClose();
    router.push(copilotHref(q));
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    ask(text.trim() || matches[active]?.text || '');
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[12vh]"
      role="dialog"
      aria-modal="true"
      aria-label="Ask Copilot"
    >
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 animate-fade bg-slate-900/30 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative w-full max-w-xl animate-rise overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-900/5">
        <form onSubmit={submit} className="flex items-center gap-3 border-b border-slate-100 px-4">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-600 text-white">
            <Icon name="sparkles" className="h-4 w-4" />
          </span>
          <input
            ref={input}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActive((i) => Math.min(i + 1, matches.length - 1));
              }
              if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActive((i) => Math.max(i - 1, 0));
              }
            }}
            placeholder="Ask about your timesheet, pay, policies or requests…"
            aria-label="Your question"
            className="h-14 flex-1 bg-transparent text-[15px] text-slate-900 placeholder:text-slate-500 focus:outline-none"
          />
          <kbd className="hidden rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[11px] text-slate-500 sm:block">
            Esc
          </kbd>
        </form>

        <div className="max-h-80 overflow-y-auto p-2">
          {text.trim() && (
            <button
              type="button"
              onClick={() => ask(text)}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm text-slate-900 hover:bg-brand-50"
            >
              <Icon name="send" className="h-4 w-4 text-brand-600" />
              <span className="truncate">
                Ask: <span className="font-medium">{text.trim()}</span>
              </span>
            </button>
          )}
          {matches.length > 0 && (
            <p className="px-3 pt-2 pb-1 text-[11px] font-semibold tracking-wide text-slate-500 uppercase">
              Suggestions
            </p>
          )}
          {matches.map((s, i) => (
            <button
              key={s.text}
              type="button"
              onMouseEnter={() => setActive(i)}
              onClick={() => ask(s.text)}
              className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm ${
                i === active && !text.trim()
                  ? 'bg-slate-100 text-slate-900'
                  : 'text-slate-700 hover:bg-slate-50'
              }`}
            >
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-slate-100 text-slate-500">
                <Icon name={GROUP_ICON[s.group]} className="h-4 w-4" />
              </span>
              <span className="flex-1 truncate">{s.text}</span>
              <span className="text-[11px] text-slate-500">{s.group}</span>
            </button>
          ))}
        </div>
        <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/60 px-4 py-2 text-[11px] text-slate-500">
          <span>Answers cite company policy. Actions always ask you to confirm.</span>
          <span className="hidden sm:inline">↵ to ask</span>
        </div>
      </div>
    </div>
  );
}
