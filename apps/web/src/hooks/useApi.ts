'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '@/lib/api';

export type Loadable<T> =
  | { kind: 'loading'; data?: T }
  | { kind: 'ready'; data: T }
  | { kind: 'error'; error: ApiError; data?: T };

const toApiError = (err: unknown) =>
  err instanceof ApiError ? err : new ApiError(0, 'INTERNAL', 'Something went wrong');

/**
 * Loads data on mount and whenever `key` changes; `reload` refetches and keeps
 * the previous data visible meanwhile; `set` replaces it (e.g. after a save).
 */
export function useApi<T>(load: () => Promise<T>, key: string = '') {
  const [state, setState] = useState<Loadable<T>>({ kind: 'loading' });
  const loader = useRef(load);
  loader.current = load;
  const generation = useRef(0);

  const reload = useCallback(async () => {
    const id = ++generation.current;
    setState((s) => ({ kind: 'loading', data: s.data }));
    try {
      const data = await loader.current();
      if (id === generation.current) setState({ kind: 'ready', data });
    } catch (err) {
      if (id === generation.current) {
        setState((s) => ({ kind: 'error', error: toApiError(err), data: s.data }));
      }
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [key, reload]);

  const set = useCallback((data: T) => setState({ kind: 'ready', data }), []);
  return { state, reload, set };
}
