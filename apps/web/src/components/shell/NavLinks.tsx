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

export function NavLinks({ items, onNavigate }: { items: NavItem[]; onNavigate?: () => void }) {
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
            aria-current={active ? 'page' : undefined}
            className={`group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
              active
                ? 'bg-brand-50 text-brand-700'
                : 'text-slate-600 hover:bg-slate-100/80 hover:text-slate-900'
            }`}
          >
            {active && (
              <span
                aria-hidden="true"
                className="absolute top-2 bottom-2 -left-4 w-1 rounded-r-full bg-brand-600"
              />
            )}
            <Icon
              name={item.icon}
              className={`h-4.5 w-4.5 ${active ? 'text-brand-600' : 'text-slate-500 group-hover:text-slate-600'}`}
            />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
