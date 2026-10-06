// Numeric check (playbook W2-06): every number in an answer must appear in
// the chunks it cites. P-3 must copy numbers and dates exactly; a number with
// no source (an invented amount, limit or duration) withdraws the answer.
// Digits only: number words ("two weeks") are not checked.

/** Canonical form, so "1,000", "1000" and "1000.0" compare equal. */
function canonical(token: string): string {
  const plain = /^\d{1,3}(,\d{3})+(\.\d+)?$/.test(token) ? token.replace(/,/g, '') : token;
  const n = Number(plain.replace(',', '.'));
  return Number.isFinite(n) ? String(n) : plain;
}

/** Numbers in a text, ignoring [Sx] markers and list numbering ("1. ", "2) "). */
export function extractNumbers(text: string): string[] {
  const stripped = text
    .replace(/\[\s*s\d+(?:\s*,\s*s\d+)*\s*\]/gi, ' ')
    .replace(/^\s*\d+[.)]\s+/gm, ' ');
  return (stripped.match(/\d+(?:[.,]\d+)*/g) ?? []).map(canonical);
}

/** Numbers in the answer that appear in none of the cited chunk texts (distinct, in order). */
export function numericViolations(answer: string, citedTexts: string[]): string[] {
  const allowed = new Set(citedTexts.flatMap(extractNumbers));
  return [...new Set(extractNumbers(answer))].filter((n) => !allowed.has(n));
}
