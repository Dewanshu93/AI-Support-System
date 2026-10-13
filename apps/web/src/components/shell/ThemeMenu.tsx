'use client';

import { useEffect, useRef, useState } from 'react';
import { Icon, type IconName } from '@/components/ui/Icon';
import { useTheme } from '@/hooks/useTheme';
import { THEME_OPTIONS, type ThemePreference } from '@/lib/theme';

const OPTION_ICON: Record<ThemePreference, IconName> = {
  light: 'sun',
  dark: 'moon',
  system: 'monitor',
};

/**
 * Appearance switch in the top bar, left of the bell (and top-right on the sign-in
 * page): the icon shows the theme in effect; the menu offers Light, Dark and System.
 */
export function ThemeMenu() {
  const { preference, resolved, choose } = useTheme();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('mousedown', onClick);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onClick);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={root}>
      <button
        type="button"
        data-testid="theme-menu"
        aria-label={`Theme: ${resolved === 'dark' ? 'dark' : 'light'}`}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Change theme"
        onClick={() => setOpen((o) => !o)}
        className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200/80 bg-surface text-slate-600 shadow-card transition hover:text-slate-900"
      >
        <Icon name={resolved === 'dark' ? 'moon' : 'sun'} className="h-5 w-5" />
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Theme"
          className="absolute right-0 z-40 mt-2 w-40 animate-rise overflow-hidden rounded-xl border border-slate-200/80 bg-surface p-1 shadow-lift"
        >
          {THEME_OPTIONS.map((o) => {
            const active = preference === o.value;
            return (
              <button
                key={o.value}
                type="button"
                role="menuitemradio"
                aria-checked={active}
                onClick={() => {
                  choose(o.value);
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm transition ${
                  active
                    ? 'bg-brand-50 font-medium text-brand-700'
                    : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                <Icon name={OPTION_ICON[o.value]} className="h-4 w-4" />
                {o.label}
                {active && <Icon name="check" className="ml-auto h-4 w-4" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
