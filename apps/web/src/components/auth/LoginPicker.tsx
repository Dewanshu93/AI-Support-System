'use client';

import type { DemoUser, Role } from '@sd/shared';
import { useCallback, useEffect, useState } from 'react';
import { Avatar } from '@/components/ui/Avatar';
import { Badge } from '@/components/ui/Badge';
import { Icon } from '@/components/ui/Icon';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { SkeletonCards } from '@/components/ui/Skeleton';
import { api, ApiError } from '@/lib/api';
import { EMPLOYMENT_LABEL, homeFor } from '@/lib/roles';

const GROUPS: { role: Role; title: string }[] = [
  { role: 'employee', title: 'Employees' },
  { role: 'agent', title: 'Service desk agents' },
  { role: 'admin', title: 'Administrators' },
];

type Load =
  | { state: 'loading' }
  | { state: 'error'; error: ApiError }
  | { state: 'ready'; users: DemoUser[]; passwordRequired: boolean };

function asApiError(err: unknown): ApiError {
  return err instanceof ApiError ? err : new ApiError(0, 'INTERNAL', 'Something went wrong');
}

/** Demo persona picker (playbook section 10, Login). */
export function LoginPicker() {
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  const [password, setPassword] = useState('');
  const [pending, setPending] = useState<string | null>(null);
  const [loginError, setLoginError] = useState<ApiError | null>(null);

  const fetchUsers = useCallback(async () => {
    setLoad({ state: 'loading' });
    try {
      const { users, passwordRequired } = await api.demoUsers();
      setLoad({ state: 'ready', users, passwordRequired });
    } catch (err) {
      setLoad({ state: 'error', error: asApiError(err) });
    }
  }, []);

  useEffect(() => {
    void fetchUsers();
  }, [fetchUsers]);

  async function signIn(user: DemoUser) {
    setPending(user.id);
    setLoginError(null);
    try {
      const signedIn = await api.login({
        userId: user.id,
        ...(load.state === 'ready' && load.passwordRequired && { password }),
      });
      // Full page load: server layouts re-run with the new session cookie.
      window.location.assign(homeFor(signedIn.role));
    } catch (err) {
      setLoginError(asApiError(err));
      setPending(null);
    }
  }

  if (load.state === 'loading') return <SkeletonCards count={6} label="Loading demo users" />;
  if (load.state === 'error') {
    return (
      <ErrorState
        title="API unreachable"
        message={load.error.message}
        requestId={load.error.requestId}
        onRetry={fetchUsers}
      />
    );
  }
  if (load.users.length === 0) {
    return (
      <EmptyState
        title="No demo users"
        description={
          <>
            Run <code className="font-mono">npm run seed</code> to create the demo personas, then
            reload.
          </>
        }
      />
    );
  }

  const needsPassword = load.passwordRequired && password.length === 0;
  return (
    <div className="space-y-8">
      {load.passwordRequired && (
        <label className="block max-w-sm space-y-1">
          <span className="text-sm font-medium text-slate-900">Demo password</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            className="block h-10 w-full rounded-lg border border-slate-300 px-3 text-sm focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10 focus:outline-none"
          />
        </label>
      )}
      {loginError && (
        <ErrorState
          title="Could not sign in"
          message={loginError.message}
          requestId={loginError.requestId}
        />
      )}
      {GROUPS.map(({ role, title }) => {
        const people = load.users.filter((u) => u.role === role);
        if (people.length === 0) return null;
        return (
          <section key={role} aria-labelledby={`group-${role}`} className="space-y-3">
            <h2
              id={`group-${role}`}
              className="text-xs font-semibold tracking-wide text-slate-500 uppercase"
            >
              {title}
            </h2>
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {people.map((user) => (
                <li key={user.id}>
                  <button
                    type="button"
                    onClick={() => signIn(user)}
                    disabled={pending !== null || needsPassword}
                    aria-label={`Sign in as ${user.name}`}
                    className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-surface p-4 text-left shadow-card transition hover:border-brand-300 hover:shadow-lift disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <Avatar name={user.name} />
                    <span className="min-w-0 flex-1 space-y-1">
                      <span className="block text-sm font-semibold text-slate-900">
                        {user.name}
                        {pending === user.id && (
                          <span className="ml-2 text-xs font-normal text-slate-500">
                            Signing in…
                          </span>
                        )}
                      </span>
                      <span className="block text-xs text-slate-600">{user.jobTitle}</span>
                      <span className="flex gap-1">
                        <Badge>{user.country}</Badge>
                        <Badge>{EMPLOYMENT_LABEL[user.employmentType]}</Badge>
                      </span>
                    </span>
                    <Icon name="arrowRight" className="h-4 w-4 text-slate-400" />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
