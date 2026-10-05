import { CHUNK_TOKENS, chunkMarkdown, estimateTokens, normaliseMarkdown } from './chunker';

const words = (n: number, word = 'policy') =>
  Array.from({ length: n }, (_, i) => `${word}${i}`).join(' ');

describe('normaliseMarkdown', () => {
  it('normalises line endings, trailing spaces and blank-line runs', () => {
    expect(normaliseMarkdown('a  \r\nb\r\n\r\n\r\n\r\nc\t\n')).toBe('a\nb\n\nc');
  });
});

describe('chunkMarkdown — headings', () => {
  it('splits on H2/H3 and records the heading trail as sectionPath', async () => {
    const chunks = await chunkMarkdown(
      [
        'Intro text before any heading.',
        '## Eligibility',
        'After 90 days.',
        '### Contractors',
        'Not eligible.',
        '## Paid leave',
        '16 weeks.',
      ].join('\n'),
    );
    expect(chunks.map((c) => [c.ordinal, c.sectionPath, c.text])).toEqual([
      [0, [], 'Intro text before any heading.'],
      [1, ['Eligibility'], 'After 90 days.'],
      [2, ['Eligibility', 'Contractors'], 'Not eligible.'],
      [3, ['Paid leave'], '16 weeks.'],
    ]);
  });

  it('skips headings with no content and keeps a short section as one chunk', async () => {
    const chunks = await chunkMarkdown('## Empty\n\n## Short\nOne line.');
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toMatchObject({
      sectionPath: ['Short'],
      tokenCount: estimateTokens('One line.'),
    });
  });

  it('does not treat a # line inside text or H4 as a section', async () => {
    const chunks = await chunkMarkdown('## A\nText\n#### Detail\nMore');
    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.text).toContain('#### Detail');
  });
});

describe('chunkMarkdown — long sections', () => {
  it('keeps every chunk at or under the maximum token size', async () => {
    const body = `## Long\n${Array.from({ length: 12 }, () => words(60)).join('\n\n')}`;
    const chunks = await chunkMarkdown(body);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(c.tokenCount).toBeLessThanOrEqual(CHUNK_TOKENS.max);
    expect(new Set(chunks.map((c) => c.sectionPath.join('/')))).toEqual(new Set(['Long']));
  });

  it('overlaps consecutive prose chunks of the same section', async () => {
    const paragraphs = Array.from({ length: 10 }, (_, p) => words(70, `p${p}w`));
    const chunks = await chunkMarkdown(`## Long\n${paragraphs.join('\n\n')}`);
    expect(chunks.length).toBeGreaterThan(1);
    for (let i = 1; i < chunks.length; i++) {
      const prevTail = chunks[i - 1]!.text.split(/\s+/).slice(-5).join(' ');
      expect(chunks[i]!.text).toContain(prevTail);
    }
  });

  it('splits one very long paragraph with the recursive splitter', async () => {
    const chunks = await chunkMarkdown(`## Wall\n${words(900)}`);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(c.tokenCount).toBeLessThanOrEqual(CHUNK_TOKENS.max);
  });
});

describe('chunkMarkdown — tables', () => {
  const table = (rows: number) =>
    [
      '| Holiday | Date |',
      '| --- | --- |',
      ...Array.from(
        { length: rows },
        (_, i) => `| Holiday number ${i} with a long name | Day ${i} |`,
      ),
    ].join('\n');

  it('keeps a table whole and with its heading', async () => {
    const chunks = await chunkMarkdown(`## Holidays\nIntro.\n\n${table(5)}\n\nAfter.`);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]!.sectionPath).toEqual(['Holidays']);
    expect(chunks[0]!.text).toContain(table(5));
  });

  it('never splits a table mid-row inside a long section', async () => {
    const body = `## Section\n${words(300)}\n\n${table(20)}\n\n${words(300)}`;
    const chunks = await chunkMarkdown(body);
    const withTable = chunks.filter((c) => c.text.includes('| Holiday |'));
    expect(withTable).toHaveLength(1);
    expect(withTable[0]!.text).toContain(table(20));
    for (const c of chunks) {
      for (const line of c.text.split('\n').filter((l) => l.startsWith('|'))) {
        expect(line).toMatch(/^\|.*\|$/);
      }
    }
  });

  it('splits an oversized table between rows and repeats the header row in each part', async () => {
    const chunks = await chunkMarkdown(`## Big\n${table(120)}`);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) {
      expect(c.text.startsWith('| Holiday | Date |\n| --- | --- |')).toBe(true);
      expect(c.tokenCount).toBeLessThanOrEqual(CHUNK_TOKENS.max);
    }
    const rows = chunks.flatMap((c) => c.text.split('\n').slice(2));
    expect(rows).toHaveLength(120);
  });
});

describe('chunkMarkdown — real corpus shapes', () => {
  it('chunks a corpus-sized policy into a handful of contiguous ordinals', async () => {
    const chunks = await chunkMarkdown(
      '## Purpose\nText.\n\n## Connecting\n1. Open.\n2. Sign in.\n\n## Rules\n- One.\n- Two.',
    );
    expect(chunks.map((c) => c.ordinal)).toEqual([0, 1, 2]);
    expect(chunks[1]!.text).toBe('1. Open.\n2. Sign in.');
  });
});
