// Display formatting for dates, money and hours. Dates from the API are
// calendar days ("YYYY-MM-DD", UTC) or ISO timestamps.

const day = (iso: string) => new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso);

const fmt = (iso: string, options: Intl.DateTimeFormatOptions) =>
  day(iso).toLocaleDateString('en-GB', { timeZone: 'UTC', ...options });

/** "Fri 11 Sep" */
export const shortDate = (iso: string) =>
  fmt(iso, { weekday: 'short', day: 'numeric', month: 'short' });
/** "11 Sep 2026" */
export const longDate = (iso: string) =>
  fmt(iso, { day: 'numeric', month: 'short', year: 'numeric' });
/** "Wednesday, 7 October" */
export const fullDate = (iso: string) =>
  fmt(iso, { weekday: 'long', day: 'numeric', month: 'long' });
/** "Mon" */
export const weekday = (iso: string) => fmt(iso, { weekday: 'short' });
/** "7" */
export const dayOfMonth = (iso: string) => String(day(iso).getUTCDate());
/** "1 – 15 Sep" or "28 Sep – 4 Oct" */
export function dateSpan(from: string, to: string): string {
  const a = day(from);
  const b = day(to);
  const sameMonth = a.getUTCMonth() === b.getUTCMonth();
  return sameMonth
    ? `${a.getUTCDate()} – ${fmt(to, { day: 'numeric', month: 'short' })}`
    : `${fmt(from, { day: 'numeric', month: 'short' })} – ${fmt(to, { day: 'numeric', month: 'short' })}`;
}

export function money(amount: number, currency: 'USD' | 'GBP'): string {
  return new Intl.NumberFormat(currency === 'USD' ? 'en-US' : 'en-GB', {
    style: 'currency',
    currency,
  }).format(amount);
}

/** 8 → "8h", 7.5 → "7.5h" */
export const hours = (h: number) => `${Number.isInteger(h) ? h : h.toFixed(1)}h`;

/** "just now", "5 min ago", "3 h ago", "2 days ago", then a date. */
export function relativeTime(iso: string, now: Date = new Date()): string {
  const diff = (now.getTime() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86_400) return `${Math.floor(diff / 3600)} h ago`;
  if (diff < 7 * 86_400) {
    const days = Math.floor(diff / 86_400);
    return `${days} day${days === 1 ? '' : 's'} ago`;
  }
  return longDate(iso);
}

/** Days from `today` to `date` (calendar days, negative when past). */
export const daysUntil = (date: string, today: string) =>
  Math.round((day(date).getTime() - day(today).getTime()) / 86_400_000);

export function dueLabel(
  due: string | null,
  today: string,
): { text: string; overdue: boolean } | null {
  if (!due) return null;
  const n = daysUntil(due, today);
  if (n < 0) return { text: `Overdue ${-n}d`, overdue: true };
  if (n === 0) return { text: 'Due today', overdue: false };
  if (n === 1) return { text: 'Due tomorrow', overdue: false };
  return { text: `Due ${shortDate(due)}`, overdue: false };
}

export const addDays = (iso: string, n: number) =>
  new Date(day(iso).getTime() + n * 86_400_000).toISOString().slice(0, 10);

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');

/** Morning / afternoon / evening greeting for the local time. */
export function greeting(now: Date = new Date()): string {
  const h = now.getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}
