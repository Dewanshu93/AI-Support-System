'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  applyTheme,
  readPreference,
  type ResolvedTheme,
  setPreference,
  THEME_CHANGE_EVENT,
  type ThemePreference,
} from '@/lib/theme';

/** The stored preference and the theme in effect; follows the OS while on "system". */
export function useTheme() {
  const [preference, setPref] = useState<ThemePreference>('system');
  const [resolved, setResolved] = useState<ResolvedTheme>('light');

  useEffect(() => {
    const sync = () => {
      const pref = readPreference();
      setPref(pref);
      setResolved(applyTheme(pref));
    };
    sync();
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    window.addEventListener(THEME_CHANGE_EVENT, sync);
    window.addEventListener('storage', sync); // another tab changed it
    media.addEventListener('change', sync);
    return () => {
      window.removeEventListener(THEME_CHANGE_EVENT, sync);
      window.removeEventListener('storage', sync);
      media.removeEventListener('change', sync);
    };
  }, []);

  const choose = useCallback((pref: ThemePreference) => setPreference(pref), []);
  return { preference, resolved, choose };
}
