// Resolves a date phrase from the copilot's extraction into a calendar day
// (UC-05). Code, not the model, turns "yesterday" or "11 September" into a
// date (Build Contract v2.0, rule E.3). Pure; "today" is passed in.
import type { IsoDate } from '@sd/shared';

const DAY_MS = 86_400_000;
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const MONTHS = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
];

export type DateResolution = { date: IsoDate } | { error: 'unrecognised' | 'invalid' };

const toTime = (d: IsoDate) => Date.parse(`${d}T00:00:00Z`);
const fromTime = (t: number): IsoDate => new Date(t).toISOString().slice(0, 10);
const addDays = (d: IsoDate, n: number) => fromTime(toTime(d) + n * DAY_MS);

/** Month index (0–11) from a full or abbreviated name ("sep", "sept", "september"). */
function monthIndex(word: string): number {
  const w = word.toLowerCase().replace(/\.$/, '');
  if (w.length < 3) return -1;
  return MONTHS.findIndex((m) => m.startsWith(w) || (w === 'sept' && m === 'september'));
}

function weekdayIndex(word: string): number {
  const w = word.toLowerCase();
  return w.length < 3 ? -1 : WEEKDAYS.findIndex((d) => d.startsWith(w));
}

function calendarDate(year: number, month: number, day: number): DateResolution {
  const d = new Date(Date.UTC(year, month, day));
  if (d.getUTCMonth() !== month || d.getUTCDate() !== day) return { error: 'invalid' };
  return { date: d.toISOString().slice(0, 10) };
}

/**
 * Supported: ISO dates; today, yesterday, the day before yesterday; a weekday
 * ("Monday", "on Friday": the most recent one, today included; "last Friday":
 * the most recent one before today); "11 September", "September 11", "11th
 * Sep 2026", "Sep 11, 2026". A date without a year is in the current year.
 * Anything else (e.g. "11/09", ambiguous between US and UK) is unrecognised.
 */
export function resolveDateText(text: string, today: IsoDate): DateResolution {
  const t = text
    .trim()
    .toLowerCase()
    .replace(/[,.]/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^(on|for) /, '')
    .trim();
  if (!t) return { error: 'unrecognised' };

  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (iso) return calendarDate(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));

  if (t === 'today') return { date: today };
  if (t === 'yesterday') return { date: addDays(today, -1) };
  if (t === 'the day before yesterday' || t === 'day before yesterday') {
    return { date: addDays(today, -2) };
  }

  const weekday = /^(last |this )?([a-z]+)$/.exec(t);
  if (weekday) {
    const target = weekdayIndex(weekday[2]!);
    if (target >= 0) {
      const current = new Date(toTime(today)).getUTCDay();
      let back = (current - target + 7) % 7;
      if (weekday[1] === 'last ' && back === 0) back = 7;
      return { date: addDays(today, -back) };
    }
  }

  const year = Number(today.slice(0, 4));
  const dayFirst = /^(\d{1,2})(?:st|nd|rd|th)? (?:of )?([a-z]+)(?: (\d{4}))?$/.exec(t);
  if (dayFirst) {
    const month = monthIndex(dayFirst[2]!);
    if (month >= 0) {
      return calendarDate(Number(dayFirst[3] ?? year), month, Number(dayFirst[1]));
    }
  }
  const monthFirst = /^([a-z]+) (\d{1,2})(?:st|nd|rd|th)?(?: (\d{4}))?$/.exec(t);
  if (monthFirst) {
    const month = monthIndex(monthFirst[1]!);
    if (month >= 0) {
      return calendarDate(Number(monthFirst[3] ?? year), month, Number(monthFirst[2]));
    }
  }
  return { error: 'unrecognised' };
}
