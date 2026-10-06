import { chunkText, ProseFilter } from './streamMapping';

const run = (pieces: string[]) => {
  const f = new ProseFilter();
  return pieces.map((p) => f.push(p));
};

describe('ProseFilter', () => {
  it('passes prose through and stops at the trailer fence', () => {
    const out = run(['You get ', '15 days [S1].', '\n\n```json\n{"uncov', 'ered": []}\n```']);
    expect(out.join('')).toBe('You get 15 days [S1].');
    expect(out[3]).toBe('');
  });

  it('holds back a fence split across chunks, and the blank lines before it', () => {
    const out = run(['Answer [S1].\n\n`', '`', '`json {}']);
    expect(out).toEqual(['Answer [S1].', '', '']);
  });

  it('releases held whitespace and backticks when prose continues', () => {
    expect(run(['Use `', 'vpn`', ' and ', 'more']).join('')).toBe('Use `vpn` and more');
    expect(run(['Line one.\n', 'Line two.']).join('')).toBe('Line one.\nLine two.');
  });
});

describe('chunkText', () => {
  it('reads string and part-array content', () => {
    expect(chunkText('a')).toBe('a');
    expect(chunkText([{ type: 'text', text: 'a' }, 'b', { type: 'image' }])).toBe('ab');
    expect(chunkText(undefined)).toBe('');
  });
});
