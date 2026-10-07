import type { AuthUser } from '@sd/shared';
import type { ReactNode } from 'react';
import { NAV_BY_ROLE } from '@/lib/roles';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';

/** Signed-in layout: sidebar navigation, top bar (copilot, notifications) and content. */
export function AppShell({ user, children }: { user: AuthUser; children: ReactNode }) {
  return (
    <div className="flex min-h-[calc(100vh-1.75rem)]">
      <Sidebar user={user} items={NAV_BY_ROLE[user.role]} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar user={user} items={NAV_BY_ROLE[user.role]} />
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 pt-2 pb-12 sm:px-6 lg:px-10">
          {children}
        </main>
      </div>
    </div>
  );
}
