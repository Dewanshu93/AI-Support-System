'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { NavItem } from '@/lib/roles';

/** Exact match for section roots (e.g. /admin), prefix match for nested routes. */
function isActive(pathname: string, href: string, all: NavItem[]): boolean {
  if (pathname === href) return true;
  const deeper = all.some(
    (i) => i.href !== href && i.href.startsWith(href) && pathname.startsWith(i.href),
  );
  return !deeper && pathname.startsWith(`${href}/`);
}

export function NavLinks({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Main" className="flex flex-wrap gap-1">
      {items.map((item) => {
        const active = isActive(pathname, item.href, items);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={`rounded-md px-3 py-2 text-sm font-medium focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:outline-none ${
              active ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100'
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
