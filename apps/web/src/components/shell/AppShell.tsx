import type { AuthUser } from '@sd/shared';
import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/Badge';
import { EMPLOYMENT_LABEL, NAV_BY_ROLE, ROLE_LABEL } from '@/lib/roles';
import { site } from '@/lib/site';
import { LogoutButton } from './LogoutButton';
import { NavLinks } from './NavLinks';

/** Signed-in layout: role navigation, user badge and logout (playbook section 10). */
export function AppShell({ user, children }: { user: AuthUser; children: ReactNode }) {
  return (
    <div className="min-h-[calc(100vh-1.75rem)]">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-4 px-4 py-3">
          <span className="text-sm font-semibold tracking-tight text-slate-900">{site.name}</span>
          <NavLinks items={NAV_BY_ROLE[user.role]} />
          <div className="ml-auto flex items-center gap-3">
            <div data-testid="user-badge" className="text-right">
              <p className="text-sm font-medium text-slate-900">{user.name}</p>
              <p className="flex justify-end gap-1">
                <Badge tone="info">{ROLE_LABEL[user.role]}</Badge>
                <Badge>{user.country}</Badge>
                <Badge>{EMPLOYMENT_LABEL[user.employmentType]}</Badge>
              </p>
            </div>
            <LogoutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
