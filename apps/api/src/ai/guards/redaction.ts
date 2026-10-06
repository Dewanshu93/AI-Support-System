// PII redaction (playbook section 9): applied to user text before it is written
// to turn_traces.redactedInput, gap clusters and eval exports. Raw text lives
// only in messages, protected by RBAC. Pattern-based and deliberately greedy:
// over-redaction is acceptable, a leaked identifier is not.

interface Rule {
  label: string;
  pattern: RegExp;
  /** Only redact matches with at least this many digits. */
  minDigits?: number;
}

/** Order matters: the most specific patterns run first. */
const RULES: Rule[] = [
  { label: '[EMAIL]', pattern: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi },
  // US Social Security number: 123-45-6789 or 123 45 6789.
  { label: '[SSN]', pattern: /\b\d{3}[- ]\d{2}[- ]\d{4}\b/g },
  // UK National Insurance number: AB 12 34 56 C (spaces optional).
  {
    label: '[NI_NUMBER]',
    pattern: /\b[A-CEGHJ-PR-TW-Z][A-CEGHJ-NPR-TW-Z]\s?\d{2}\s?\d{2}\s?\d{2}\s?[A-D]\b/gi,
  },
  // Card-like: 13–19 digits, optionally grouped by spaces or dashes.
  { label: '[CARD]', pattern: /\b\d(?:[ -]?\d){12,18}\b/g },
  // Phone numbers: optional +country or (area), digit groups with separators, 9+ digits.
  {
    label: '[PHONE]',
    pattern: /(?:\+\d{1,3}[\s.-]?)?(?:\(\d{2,5}\)[\s.-]?)?\d{2,6}(?:[\s.-]\d{2,6}){1,4}\b/g,
    minDigits: 9,
  },
  // Remaining ID-like numbers: any run of 8 or more digits.
  { label: '[ID]', pattern: /\b\d{8,}\b/g },
];

const digitCount = (s: string) => s.match(/\d/g)?.length ?? 0;

export function redactPII(text: string): string {
  let out = text;
  for (const rule of RULES) {
    out = out.replace(rule.pattern, (match) =>
      rule.minDigits && digitCount(match) < rule.minDigits ? match : rule.label,
    );
  }
  return out;
}
