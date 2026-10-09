'use client';

import type { Notification, NotificationListResponse } from '@sd/shared';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import { Spinner } from '@/components/ui/Spinner';
import { api } from '@/lib/api';
import { relativeTime } from '@/lib/format';
import { NotificationIcon } from '@/components/workspace/NotificationIcon';

/** How often the bell refreshes while the tab is visible. */
export const REFRESH_MS = 60_000;

/** Bell with unread count and a dropdown of recent notifications. */
export function NotificationBell() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<NotificationListResponse | null>(null);
  const [failed, setFailed] = useState(false);
  const panel = useRef<HTMLDivElement>(null);

  const load = useCallback(() => {
    api.notifications(12).then(
      (d) => {
        setData(d);
        setFailed(false);
      },
      () => setFailed(true),
    );
  }, []);

  useEffect(() => load(), [load]);
  // Request updates by agents (UC-08) appear without a reload: refresh when the
  // window regains focus and once a minute while the tab is visible. In-app only.
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === 'visible') load();
    };
    const timer = window.setInterval(refresh, REFRESH_MS);
    window.addEventListener('focus', refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
    };
  }, [load]);
  useEffect(() => {
    if (!open) return;
    load();
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
  }, [open, load]);

  const markAll = async () => {
    const result = await api.markNotificationsRead().catch(() => null);
    if (result && data) {
      setData({ items: data.items.map((n) => ({ ...n, read: true })), unreadCount: 0 });
    }
  };

  const openItem = async (n: Notification) => {
    setOpen(false);
    if (!n.read) {
      void api.markNotificationsRead([n.id]).then(load, () => undefined);
    }
    if (n.link) router.push(n.link);
  };

  const unread = data?.unreadCount ?? 0;
  return (
    <div className="relative" ref={panel}>
      <button
        type="button"
        data-testid="notification-bell"
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="relative grid h-10 w-10 place-items-center rounded-xl border border-slate-200/80 bg-white text-slate-600 shadow-card transition hover:text-slate-900"
      >
        <Icon name="bell" className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 grid h-5 min-w-5 place-items-center rounded-full bg-rose-500 px-1 text-[10px] font-semibold text-white ring-2 ring-canvas">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-40 mt-2 w-[min(24rem,calc(100vw-2rem))] animate-rise overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-lift">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <p className="text-sm font-semibold text-slate-900">Notifications</p>
            {unread > 0 && (
              <button
                type="button"
                onClick={() => void markAll()}
                className="text-xs font-medium text-brand-600 hover:text-brand-700"
              >
                Mark all as read
              </button>
            )}
          </div>
          <div className="scrollbar-thin max-h-96 overflow-y-auto">
            {!data && !failed && (
              <div className="grid place-items-center py-8">
                <Spinner />
              </div>
            )}
            {failed && !data && (
              <p className="px-4 py-6 text-center text-sm text-slate-500">
                Could not load notifications.
              </p>
            )}
            {data?.items.length === 0 && (
              <p className="px-4 py-8 text-center text-sm text-slate-500">You are all caught up.</p>
            )}
            {data?.items.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => void openItem(n)}
                className={`flex w-full gap-3 px-4 py-3 text-left transition hover:bg-slate-50 ${n.read ? '' : 'bg-brand-50/40'}`}
              >
                <NotificationIcon kind={n.kind} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-start justify-between gap-2">
                    <span
                      className={`text-sm ${n.read ? 'text-slate-700' : 'font-semibold text-slate-900'}`}
                    >
                      {n.title}
                    </span>
                    {!n.read && (
                      <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-500" />
                    )}
                  </span>
                  <span className="mt-0.5 line-clamp-2 block text-xs text-slate-500">{n.body}</span>
                  <span className="mt-1 block text-[11px] text-slate-500">
                    {relativeTime(n.createdAt)}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
