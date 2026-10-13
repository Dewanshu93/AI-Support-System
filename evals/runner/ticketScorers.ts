// Escalation quality scorers (W3-08, playbook section 8): ticket category,
// required-field accuracy after normalisation, invented values and the
// priority floor. Pure: the full suite passes the drafted ticket and the case.
import { PRIORITIES, type Priority } from '@sd/shared';
import type { GoldenCase } from './schema';

/** What the escalation drafted on the scored turn (the eval never confirms it). */
export interface DraftedTicket {
  category: string;
  subcategory: string | null;
  priority: Priority;
  fields: Record<string, string>;
}

export const UNKNOWN = 'unknown';

/**
 * Words treated as the same after normalisation (section 8: "synonyms map").
 * Kept short and specific to the corpus; each entry maps a variant to one form.
 */
export const FIELD_SYNONYMS: Record<string, string> = {
  notebook: 'laptop',
  pc: 'laptop',
  computer: 'laptop',
  vpn: 'vpn',
  'virtual private network': 'vpn',
  holiday: 'leave',
  vacation: 'leave',
  'time off': 'leave',
  pto: 'leave',
  'annual leave': 'leave',
  wfh: 'work from home',
  'remote work': 'work from home',
  'working from home': 'work from home',
  mfa: 'multi factor authentication',
  '2fa': 'multi factor authentication',
  'two factor authentication': 'multi factor authentication',
  payslip: 'payslip',
  'pay slip': 'payslip',
  salary: 'pay',
  wage: 'pay',
  wages: 'pay',
};

const STOP = new Set([
  'a',
  'an',
  'the',
  'of',
  'my',
  'for',
  'to',
  'is',
  'on',
  'in',
  'and',
  'or',
  'it',
]);

/** Lowercase, trimmed, punctuation removed, synonyms applied, stop words dropped. */
export function normaliseField(value: string): string {
  let text = ` ${value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()} `;
  // Longest variants first, so "annual leave" wins over "leave".
  for (const [variant, canonical] of Object.entries(FIELD_SYNONYMS).sort(
    (a, b) => b[0].length - a[0].length,
  )) {
    text = text.split(` ${variant} `).join(` ${canonical} `);
  }
  return text
    .trim()
    .split(' ')
    .filter((w) => w && !STOP.has(w))
    .join(' ');
}

/**
 * A drafted value matches the expected one when, after normalisation, they are
 * equal, one contains the other, or they share at least half their words.
 */
export function fieldMatches(actual: string, expected: string): boolean {
  const a = normaliseField(actual);
  const e = normaliseField(expected);
  if (!a || !e) return a === e;
  if (a === e || a.includes(e) || e.includes(a)) return true;
  const aw = new Set(a.split(' '));
  const ew = new Set(e.split(' '));
  const shared = [...aw].filter((w) => ew.has(w)).length;
  return shared / Math.max(aw.size, ew.size) >= 0.5;
}

export interface TicketScore {
  categoryCorrect: boolean;
  /** Required fields with a known expected value: checked / matched. */
  fieldsChecked: number;
  fieldsMatched: number;
  mismatched: string[];
  /** Fields the draft filled where the case expects "unknown". */
  invented: string[];
  /** Safety cases only: final priority ≥ the case's minPriority; null otherwise. */
  floorMet: boolean | null;
}

const rank = (p: Priority) => PRIORITIES.indexOf(p);

export function scoreTicket(
  expected: NonNullable<GoldenCase['expected']['ticket']>,
  drafted: DraftedTicket | null,
  options: { requiredFields: string[]; safety: boolean },
): TicketScore {
  const checked = options.requiredFields.filter(
    (k) => expected.fields[k] !== undefined && expected.fields[k] !== UNKNOWN,
  );
  if (!drafted) {
    return {
      categoryCorrect: false,
      fieldsChecked: checked.length,
      fieldsMatched: 0,
      mismatched: checked,
      invented: [],
      floorMet: options.safety ? false : null,
    };
  }
  const mismatched = checked.filter(
    (k) => !fieldMatches(drafted.fields[k] ?? UNKNOWN, expected.fields[k]!),
  );
  const invented = Object.entries(expected.fields)
    .filter(([k, v]) => v === UNKNOWN && (drafted.fields[k] ?? UNKNOWN) !== UNKNOWN)
    .map(([k]) => k);
  return {
    categoryCorrect: drafted.category === expected.category,
    fieldsChecked: checked.length,
    fieldsMatched: checked.length - mismatched.length,
    mismatched,
    invented,
    floorMet: options.safety ? rank(drafted.priority) >= rank(expected.minPriority) : null,
  };
}
