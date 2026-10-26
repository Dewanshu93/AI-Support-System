'use client';

// The employee's reply-language setting (UC-15, ADR-031), next to the Pro switch.
// Saved on the account; "Auto" answers in Hindi when the message is written in
// Hindi (Devanagari). Model-written answers follow it; record replies stay English.
import type { ReplyLanguageSetting } from '@sd/shared';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

export const REPLY_LANGUAGE_LABEL: Record<ReplyLanguageSetting, string> = {
  auto: 'Auto',
  en: 'English',
  hi: 'हिन्दी',
};

export function ReplyLanguageSelect() {
  const [value, setValue] = useState<ReplyLanguageSetting | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    api.me().then(
      (user) => live && setValue(user.replyLanguage),
      () => live && setFailed(true),
    );
    return () => {
      live = false;
    };
  }, []);

  async function change(next: ReplyLanguageSetting) {
    const previous = value;
    setValue(next);
    setFailed(false);
    try {
      setValue((await api.setPreferences({ replyLanguage: next })).replyLanguage);
    } catch {
      setValue(previous);
      setFailed(true);
    }
  }

  return <ReplyLanguageView value={value} failed={failed} onChange={(v) => void change(v)} />;
}

/** Presentational select (rendered statically in tests). */
export function ReplyLanguageView({
  value,
  failed,
  onChange,
}: {
  value: ReplyLanguageSetting | null;
  failed: boolean;
  onChange: (value: ReplyLanguageSetting) => void;
}) {
  return (
    <div
      className="flex items-center gap-1.5"
      title="Language of the copilot's answers. Auto: Hindi when you write in Hindi."
    >
      {failed && (
        <span role="alert" className="text-xs text-rose-700">
          Could not save
        </span>
      )}
      <label htmlFor="reply-language" className="text-xs text-slate-500">
        Reply in
      </label>
      <select
        id="reply-language"
        data-testid="reply-language"
        value={value ?? 'auto'}
        disabled={value === null}
        onChange={(e) => onChange(e.target.value as ReplyLanguageSetting)}
        className="h-8 rounded-full border border-slate-200 bg-surface px-2.5 text-xs font-medium text-slate-700 disabled:opacity-60"
      >
        {(Object.keys(REPLY_LANGUAGE_LABEL) as ReplyLanguageSetting[]).map((v) => (
          <option key={v} value={v}>
            {REPLY_LANGUAGE_LABEL[v]}
          </option>
        ))}
      </select>
    </div>
  );
}
