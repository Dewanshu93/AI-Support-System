'use client';

import type { AuthUser } from '@sd/shared';
import { useEffect, useRef, useState } from 'react';
import { Badge } from '@/components/ui/Badge';
import { Icon } from '@/components/ui/Icon';
import { initials } from '@/lib/format';
import { EMPLOYMENT_LABEL, ROLE_LABEL } from '@/lib/roles';
import { LogoutButton } from './LogoutButton';

/** Top-right avatar next to the bell; opens the signed-in user's profile details and sign-out. */
export function ProfileMenu({ user }: { user: AuthUser }) {
  const [open, setOpen] = useState(false);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (panel.current && !panel.current.contains(e.target as Node)) setOpen(false);
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
    <div className="relative" ref={panel}>
      <button
        type="button"
        data-testid="profile-menu"
        aria-label={`Profile: ${user.name}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex h-10 items-center gap-2 rounded-xl border border-slate-200/80 bg-white pr-2 pl-1 text-slate-700 shadow-card transition hover:text-slate-900"
      >
        <span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-600 text-xs font-semibold text-white">
          {initials(user.name)}
        </span>
        <span className="hidden max-w-40 truncate text-sm font-medium md:block">{user.name}</span>
        <Icon name="chevronDown" className="h-4 w-4 text-slate-400" />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Profile"
          className="absolute right-0 z-40 mt-2 w-[min(20rem,calc(100vw-2rem))] animate-rise overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-4 shadow-lift"
        >
          <div data-testid="user-badge" className="flex items-start gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-brand-600 text-sm font-semibold text-white">
              {initials(user.name)}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-900">{user.name}</p>
              <p className="truncate text-xs text-slate-500">{user.jobTitle}</p>
              <p className="truncate text-xs text-slate-500">{user.email}</p>
              <p className="mt-2 flex flex-wrap gap-1">
                <Badge tone="brand">{ROLE_LABEL[user.role]}</Badge>
                <Badge>{user.country}</Badge>
                <Badge>{EMPLOYMENT_LABEL[user.employmentType]}</Badge>
              </p>
            </div>
          </div>
          <div className="mt-3 border-t border-slate-100 pt-1">
            <LogoutButton />
          </div>
        </div>
      )}
    </div>
  );
}
