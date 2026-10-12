'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon } from '@/components/ui/Icon';
import type { NavItem } from '@/lib/roles';

/** Exact match for section roots (e.g. /admin), prefix match for nested routes. */
function isActive(pathname: string, href: string, all: NavItem[]): boolean {
  if (pathname === href) return true;
  const deeper = all.some(
    (i) => i.href !== href && i.href.startsWith(href) && pathname.startsWith(i.href),
  );
  return !deeper && pathname.startsWith(`${href}/`);
}

/** `compact`: the collapsed sidebar's icon rail (labels stay for screen readers and tooltips). */
export function NavLinks({
  items,
  onNavigate,
  compact = false,
}: {
  items: NavItem[];
  onNavigate?: () => void;
  compact?: boolean;
}) {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="flex flex-col gap-0.5">
      {items.map((item) => {
        const active = isActive(pathname, item.href, items);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            title={compact ? item.label : undefined}
            aria-current={active ? 'page' : undefined}
            className={`group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
              compact ? 'justify-center' : ''
            } ${
              active
                ? 'bg-brand-50 text-brand-700'
                : 'text-slate-600 hover:bg-slate-100/80 hover:text-slate-900'
            }`}
          >
            {active && (
              <span
                aria-hidden="true"
                className={`absolute top-2 bottom-2 w-1 rounded-r-full bg-brand-600 ${compact ? '-left-3' : '-left-4'}`}
              />
            )}
            <Icon
              name={item.icon}
              className={`h-4.5 w-4.5 ${active ? 'text-brand-600' : 'text-slate-500 group-hover:text-slate-600'}`}
            />
            <span className={compact ? 'sr-only' : undefined}>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
