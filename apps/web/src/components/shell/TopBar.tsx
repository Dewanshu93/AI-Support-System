'use client';

import type { AuthUser } from '@sd/shared';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { homeFor, type NavItem } from '@/lib/roles';
import { CopilotPalette } from './CopilotPalette';
import { NavLinks } from './NavLinks';
import { NotificationBell } from './NotificationBell';
import { ProfileMenu } from './ProfileMenu';
import { BrandMark } from './Sidebar';

/** Sticky top bar: mobile menu, copilot launcher (Ctrl/⌘ K), notifications and the profile menu. */
export function TopBar({ user, items }: { user: AuthUser; items: NavItem[] }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const pathname = usePathname();
  const employee = user.role === 'employee';

  useEffect(() => setMenuOpen(false), [pathname]);
  useEffect(() => {
    if (!employee) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((open) => !open);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [employee]);

  return (
    <>
      <header className="sticky top-0 z-30 border-b border-transparent bg-canvas/80 backdrop-blur-md">
        <div className="flex h-16 w-full items-center gap-3 px-4 sm:px-6 lg:px-10">
          <button
            type="button"
            aria-label="Open menu"
            onClick={() => setMenuOpen(true)}
            className="grid h-9 w-9 place-items-center rounded-lg text-slate-600 hover:bg-white lg:hidden"
          >
            <Icon name="menu" />
          </button>
          <Link href={homeFor(user.role)} className="lg:hidden">
            <BrandMark compact />
          </Link>

          {employee && (
            <button
              type="button"
              data-testid="copilot-launcher"
              onClick={() => setPaletteOpen(true)}
              className="group flex h-10 min-w-0 flex-1 items-center gap-3 rounded-xl border border-slate-200/80 bg-white px-3 text-left text-sm text-slate-500 shadow-card transition hover:border-slate-300 sm:max-w-md"
            >
              <Icon name="sparkles" className="h-4 w-4 text-brand-500" />
              <span className="truncate">Ask Copilot anything…</span>
              <span className="ml-auto hidden items-center gap-1 text-[11px] sm:flex">
                <kbd className="rounded-md border border-slate-200 bg-slate-50 px-1.5 py-0.5 font-sans text-slate-500">
                  Ctrl K
                </kbd>
              </span>
            </button>
          )}

          <div className="ml-auto flex items-center gap-2">
            {employee && <NotificationBell />}
            <ProfileMenu user={user} />
          </div>
        </div>
      </header>

      {menuOpen && (
        <div
          className="fixed inset-0 z-50 lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Menu"
        >
          <button
            type="button"
            aria-label="Close menu"
            className="absolute inset-0 animate-fade bg-slate-900/30 backdrop-blur-sm"
            onClick={() => setMenuOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 flex w-72 animate-slide-in flex-col bg-white px-4 py-5 shadow-2xl">
            <div className="mb-6 flex items-center justify-between px-2">
              <BrandMark />
              <button
                type="button"
                aria-label="Close menu"
                onClick={() => setMenuOpen(false)}
                className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-slate-100"
              >
                <Icon name="close" className="h-4 w-4" />
              </button>
            </div>
            <NavLinks items={items} onNavigate={() => setMenuOpen(false)} />
          </div>
        </div>
      )}

      {paletteOpen && <CopilotPalette onClose={() => setPaletteOpen(false)} />}
    </>
  );
}
