import type { AuthUser } from '@sd/shared';
import Link from 'next/link';
import { Badge } from '@/components/ui/Badge';
import { Icon } from '@/components/ui/Icon';
import { initials } from '@/lib/format';
import { EMPLOYMENT_LABEL, homeFor, type NavItem, ROLE_LABEL } from '@/lib/roles';
import { site } from '@/lib/site';
import { LogoutButton } from './LogoutButton';
import { NavLinks } from './NavLinks';

export function BrandMark({ compact = false }: { compact?: boolean }) {
  return (
    <span className="flex items-center gap-3">
      <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand-600 text-white">
        <Icon name="sparkles" className="h-5 w-5" />
      </span>
      {!compact && (
        <span className="leading-tight">
          <span className="block text-[15px] font-semibold tracking-tight text-slate-900">
            {site.name}
          </span>
          <span className="block text-[11px] font-medium text-slate-500">{site.subtitle}</span>
        </span>
      )}
    </span>
  );
}

export function UserCard({ user }: { user: AuthUser }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
      <div data-testid="user-badge" className="flex items-center gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-600 text-sm font-semibold text-white">
          {initials(user.name)}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-900">{user.name}</p>
          <p className="truncate text-xs text-slate-500">{user.jobTitle}</p>
          <p className="mt-1.5 flex flex-wrap gap-1">
            <Badge tone="brand">{ROLE_LABEL[user.role]}</Badge>
            <Badge>{user.country}</Badge>
            <Badge>{EMPLOYMENT_LABEL[user.employmentType]}</Badge>
          </p>
        </div>
      </div>
      <LogoutButton />
    </div>
  );
}

/** Desktop sidebar; the mobile drawer (TopBar) renders the same parts. */
export function Sidebar({ user, items }: { user: AuthUser; items: NavItem[] }) {
  return (
    <aside className="sticky top-0 hidden h-screen w-68 shrink-0 flex-col border-r border-slate-200/70 bg-white/80 px-4 py-5 backdrop-blur lg:flex">
      <Link href={homeFor(user.role)} className="mb-7 px-2">
        <BrandMark />
      </Link>
      <NavLinks items={items} />
      <div className="mt-auto space-y-3">
        {user.role === 'employee' && (
          <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-brand-700">
              <Icon name="sparkles" className="h-4 w-4" /> AI Copilot
            </p>
            <p className="mt-1 text-xs leading-relaxed text-slate-600">
              Log hours, understand your pay and raise requests by just asking.
            </p>
            <p className="mt-2 text-[11px] text-slate-500">
              Press <kbd className="rounded border border-slate-200 bg-white px-1">Ctrl</kbd>{' '}
              <kbd className="rounded border border-slate-200 bg-white px-1">K</kbd>
            </p>
          </div>
        )}
        <UserCard user={user} />
      </div>
    </aside>
  );
}
