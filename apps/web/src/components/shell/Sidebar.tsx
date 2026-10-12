'use client';

import type { AuthUser } from '@sd/shared';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { homeFor, type NavItem } from '@/lib/roles';
import { site } from '@/lib/site';
import { NavLinks } from './NavLinks';

/** Remembers the collapsed sidebar in this browser (a per-viewer convenience). */
export const SIDEBAR_STORAGE_KEY = 'sidebar-collapsed';

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

function readCollapsed(): boolean {
  try {
    return window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function saveCollapsed(collapsed: boolean): void {
  try {
    window.localStorage.setItem(SIDEBAR_STORAGE_KEY, collapsed ? '1' : '0');
  } catch {
    // Storage blocked (private window): the choice lasts for this page only.
  }
}

/**
 * Desktop sidebar, collapsible to an icon rail; the mobile drawer (TopBar)
 * renders the same links. Profile details live in the top bar (ProfileMenu).
 */
export function Sidebar({ user, items }: { user: AuthUser; items: NavItem[] }) {
  // Expanded on the server render; the saved choice applies once mounted.
  const [collapsed, setCollapsed] = useState(false);
  useEffect(() => setCollapsed(readCollapsed()), []);

  const toggle = () => {
    setCollapsed((c) => {
      saveCollapsed(!c);
      return !c;
    });
  };

  return (
    <aside
      data-testid="sidebar"
      data-collapsed={collapsed}
      className={`sticky top-0 hidden h-screen shrink-0 flex-col border-r border-slate-200/70 bg-white/80 py-5 backdrop-blur transition-[width] duration-200 lg:flex ${
        collapsed ? 'w-18 px-3' : 'w-68 px-4'
      }`}
    >
      <Link
        href={homeFor(user.role)}
        aria-label={collapsed ? site.name : undefined}
        className={`mb-7 ${collapsed ? 'self-center' : 'px-2'}`}
      >
        <BrandMark compact={collapsed} />
      </Link>
      <NavLinks items={items} compact={collapsed} />
      <div className="mt-auto space-y-3">
        {user.role === 'employee' && !collapsed && (
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
        <button
          type="button"
          data-testid="sidebar-toggle"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-expanded={!collapsed}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          onClick={toggle}
          className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-500 transition-colors hover:bg-slate-100/80 hover:text-slate-900 ${
            collapsed ? 'justify-center' : ''
          }`}
        >
          <Icon name={collapsed ? 'chevronRight' : 'chevronLeft'} className="h-4.5 w-4.5" />
          {!collapsed && 'Collapse'}
        </button>
      </div>
    </aside>
  );
}
