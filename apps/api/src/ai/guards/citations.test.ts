import type { ContextSource } from '../graph/state';
import { checkCitations } from './citations';
import { extractNumbers, numericViolations } from './numericCheck';

const source = (marker: string, chunkId: string, text = 'text'): ContextSource => ({
  marker,
  chunkId,
  documentId: `doc-${chunkId}`,
  docSlug: `doc-${chunkId}`,
  docTitle: `Title ${chunkId}`,
  sectionPath: ['Section'],
  effectiveDate: '2026-01-01T00:00:00.000Z',
  text,
  fusedScore: 0.016,
  rank: 1,
  relevance: 3,
});
const context = [source('S1', 'c1'), source('S2', 'c2')];

describe('checkCitations', () => {
  it('valid answer: every marker resolves to a context chunk', () => {
    const r = checkCitations('UK employees get 25 days [S1]. Carry over 5 days [S2].', context);
    expect(r.proposed).toEqual(['S1', 'S2']);
    expect(r.rejected).toEqual([]);
    expect(r.valid).toEqual([
      expect.objectContaining({
        marker: 'S1',
        chunkId: 'c1',
        documentId: 'doc-c1',
        docTitle: 'Title c1',
      }),
      expect.objectContaining({ marker: 'S2', chunkId: 'c2' }),
    ]);
    expect(r.text).toBe('UK employees get 25 days [S1]. Carry over 5 days [S2].');
  });

  it('invented marker: rejected and removed from the text', () => {
    const r = checkCitations('You get 25 days [S1]. Managers approve it [S7].', context);
    expect(r.proposed).toEqual(['S1', 'S7']);
    expect(r.rejected).toEqual(['S7']);
    expect(r.valid.map((c) => c.marker)).toEqual(['S1']);
    expect(r.text).toBe('You get 25 days [S1]. Managers approve it.');
  });

  it('no markers: nothing valid', () => {
    const r = checkCitations('You get 25 days of leave.', context);
    expect(r).toMatchObject({ proposed: [], valid: [], rejected: [] });
  });

  // Contract acceptance: "no citation to a document that was not retrieved".
  it('can never produce a citation to a chunk outside the retrieved context', () => {
    const r = checkCitations(
      'See [S3] and [S0] and [S12], also [chunkId: c9] and [S1, S9] [s2].',
      context,
    );
    const retrieved = new Set(context.map((s) => s.chunkId));
    expect(r.valid.every((c) => retrieved.has(c.chunkId))).toBe(true);
    expect(r.valid.map((c) => c.chunkId)).toEqual(['c1', 'c2']);
    expect(r.rejected).toEqual(['S3', 'S0', 'S12', 'S9']);
    expect(checkCitations('Anything [S1].', []).valid).toEqual([]);
  });

  it('accepts grouped and repeated markers, counting each once', () => {
    const r = checkCitations('A [S1][S2]. B [S2, S1]. C [s1].', context);
    expect(r.proposed).toEqual(['S1', 'S2']);
    expect(r.valid).toHaveLength(2);
    expect(r.text).toBe('A [S1][S2]. B [S2][S1]. C [S1].');
  });
});

describe('numeric check', () => {
  const chunks = [
    'Employees get 25 days of annual leave and may carry over 5 days until 31 March 2026.',
  ];

  it('passes when every number appears in the cited chunks', () => {
    expect(numericViolations('You get 25 days [S1] and can carry over 5 [S1].', chunks)).toEqual(
      [],
    );
    expect(numericViolations('Carry-over ends on 31 March 2026 [S1].', chunks)).toEqual([]);
  });

  it('numeric mismatch: a number not in the cited chunks is a violation', () => {
    expect(numericViolations('You get 28 days [S1] and can carry over 5 [S1].', chunks)).toEqual([
      '28',
    ]);
    expect(numericViolations('Until 31 March 2027 [S1].', chunks)).toEqual(['2027']);
  });

  it('ignores citation markers and list numbering', () => {
    expect(
      numericViolations('1. Open the app [S1].\n2) Sign in [S2].', ['no numbers here']),
    ).toEqual([]);
  });

  it('normalises thousands separators and decimals', () => {
    expect(extractNumbers('Up to $1,000 or 1000.0 or 12.5%')).toEqual(['1000', '1000', '12.5']);
    expect(numericViolations('The limit is $1,000 [S1].', ['Limit: 1000 USD'])).toEqual([]);
  });

  it('reports each violating number once', () => {
    expect(numericViolations('7 days, then 7 more, then 9 [S1].', ['no numbers'])).toEqual([
      '7',
      '9',
    ]);
  });
});
