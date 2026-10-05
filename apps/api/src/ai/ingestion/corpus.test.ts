import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DEFAULT_CONFIG_DIR, TaxonomySchema } from '../../config';
import { loadYamlFile } from '../../config/yaml';
import {
  CORPUS_DIR,
  corpusComposition,
  type CorpusDoc,
  findCompositionProblems,
  findDocumentProblems,
  findReadmeProblems,
  hasTable,
  inventoryTable,
  loadCorpus,
  parseCorpusFile,
  tableCells,
  validateCorpus,
  withInventory,
} from './corpus';

const taxonomyDomains = new Set(
  loadYamlFile(DEFAULT_CONFIG_DIR, 'taxonomy.yaml', TaxonomySchema).categories.map((c) => c.domain),
);

// W1-07 acceptance: the real corpus passes every rule (runs on every `npm test`).
describe('committed corpus', () => {
  const { docs, problems } = validateCorpus({ taxonomyDomains });

  it('passes validation with no problems', () => {
    expect(problems).toEqual([]);
  });

  it('matches the section Q composition', () => {
    const c = corpusComposition(docs);
    expect(c.total).toBeGreaterThanOrEqual(30);
    expect(c.total).toBeLessThanOrEqual(40);
    expect(c.countryPairs).toHaveLength(6);
    expect(c.superseded).toBe(2);
    expect(c.withTables.length).toBeGreaterThanOrEqual(3);
    expect(c.contractorOnly.length).toBeGreaterThan(0);
    expect(c.managerOnly.length).toBeGreaterThan(0);
  });

  it('contains the planted injection sentence only in it-office-printing', () => {
    const planted = docs.filter((d) => /ignore your previous instructions/i.test(d.body));
    expect(planted.map((d) => d.meta.slug)).toEqual(['it-office-printing']);
  });

  it('keeps the superseded traps distinguishable from their active versions', () => {
    const body = (slug: string, version: string) =>
      docs.find((d) => d.meta.slug === slug && d.meta.version === version)!.body;
    expect(body('hr-parental-leave-us', '3.0')).toContain('16 weeks');
    expect(body('hr-parental-leave-us', '2.0')).toContain('12 weeks');
    expect(body('it-password-mfa-policy', '2.0')).toMatch(/no scheduled password expiry/i);
    expect(body('it-password-mfa-policy', '1.0')).toMatch(/expire every 90 days/i);
  });

  it('has no document for the deliberately missing topics', () => {
    const text = docs
      .map((d) => `${d.meta.title}\n${d.body}`)
      .join('\n')
      .toLowerCase();
    for (const term of ['sabbatical', 'company car', 'tuition', 'stipend']) {
      expect({ term, found: text.includes(term) }).toEqual({ term, found: false });
    }
  });
});

const META = {
  slug: 'it-example',
  title: 'Example',
  domain: 'IT',
  owner: 'IT',
  version: "'1.0'",
  effectiveDate: '2025-01-01',
  countries: '[US, UK]',
  employmentTypes: '[full_time]',
  accessLevel: 'standard',
  status: 'active',
  supersedes: 'null',
};
type Meta = Partial<Record<keyof typeof META, string>>;

function md(meta: Meta = {}, body = '## Section\n\nText.'): string {
  const fields = { ...META, ...meta };
  return `---\n${Object.entries(fields)
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n')}\n---\n\n${body}\n`;
}

const doc = (file: string, meta: Meta = {}, body?: string): CorpusDoc =>
  parseCorpusFile(file, md(meta, body));

describe('parseCorpusFile', () => {
  it('parses frontmatter and body', () => {
    const parsed = doc('it/it-example.md');
    expect(parsed.meta).toMatchObject({ slug: 'it-example', version: '1.0', supersedes: null });
    expect(parsed.meta.effectiveDate).toEqual(new Date('2025-01-01'));
    expect(parsed.body).toBe('## Section\n\nText.');
  });

  it('accepts a file that starts with a UTF-8 byte-order mark', () => {
    const withBom = String.fromCharCode(0xfeff) + md();
    expect(parseCorpusFile('it/it-example.md', withBom).meta.slug).toBe('it-example');
  });

  it.each<[string, string, RegExp]>([
    ['no frontmatter', '## Just text', /missing YAML frontmatter/],
    ['malformed YAML', '---\nslug: [unclosed\n---\n## A', /malformed frontmatter at line/],
    ['unquoted version', md({ version: '3.0' }), /version: must be a quoted string/],
    ['unknown field', md({ category: 'leave' } as Meta), /Unrecognized key/],
    ['missing field', md({ owner: undefined }).replace(/^owner:.*\n/m, ''), /owner/],
    ['bad slug', md({ slug: 'IT_Example' }), /slug: must be kebab-case/],
    ['repeated country', md({ countries: '[US, US]' }), /countries: must not repeat values/],
    ['unknown domain', md({ domain: 'FINANCE' }), /domain/],
    ['bad date', md({ effectiveDate: 'soon' }), /effectiveDate/],
  ])('rejects %s, naming the file', (_name, text, expected) => {
    expect(() => parseCorpusFile('it/x.md', text)).toThrow(expected);
    expect(() => parseCorpusFile('it/x.md', text)).toThrow(/^it\/x\.md: /);
  });
});

describe('findDocumentProblems', () => {
  const problems = (docs: CorpusDoc[]) => findDocumentProblems(docs, taxonomyDomains);

  it('accepts a well-formed active and superseded pair', () => {
    expect(
      problems([
        doc('it/it-example.md', {
          version: "'2.0'",
          effectiveDate: '2026-01-01',
          supersedes: "'1.0'",
        }),
        doc('it/it-example.v1.0.md', { status: 'superseded' }),
      ]),
    ).toEqual([]);
  });

  it.each<[string, CorpusDoc[], RegExp]>([
    [
      'domain in the wrong folder',
      [doc('hr/it-example.md')],
      /domain IT does not match folder hr\//,
    ],
    ['wrong file name', [doc('it/example.md')], /file name should be it-example\.md/],
    [
      'old version named like the active one',
      [doc('it/it-example.md', { status: 'superseded' })],
      /file name should be it-example\.v1\.0\.md/,
    ],
    ['no H2 heading', [doc('it/it-example.md', {}, 'Just a paragraph.')], /at least one "## "/],
    [
      'an H1 heading',
      [doc('it/it-example.md', {}, '# Title\n\n## A\n\nx')],
      /do not use a "# " heading/,
    ],
    [
      '-us slug with UK country',
      [doc('it/it-x-us.md', { slug: 'it-x-us', countries: '[UK]' })],
      /"-us" slug must have countries \[US\]/,
    ],
    [
      'duplicate slug and version',
      [doc('it/it-example.md'), doc('it/it-example.md')],
      /duplicate slug and version it-example@1\.0/,
    ],
    [
      'two active versions',
      [doc('it/it-example.md'), doc('it/it-example.md', { version: "'2.0'" })],
      /2 active versions \(1\.0, 2\.0\)/,
    ],
    [
      'supersedes a missing version',
      [doc('it/it-example.md', { version: "'2.0'", supersedes: "'1.5'" })],
      /supersedes it-example@1\.5, which is not in the corpus/,
    ],
    [
      'supersedes an active version',
      [
        doc('it/it-example.md', {
          version: "'2.0'",
          effectiveDate: '2026-01-01',
          supersedes: "'1.0'",
        }),
        doc('it/it-example.v1.0.md', { status: 'inactive' }),
      ],
      /which must have status superseded/,
    ],
    [
      'supersedes with a lower version',
      [
        doc('it/it-example.md', {
          version: "'0.9'",
          effectiveDate: '2026-01-01',
          supersedes: "'1.0'",
        }),
        doc('it/it-example.v1.0.md', { status: 'superseded' }),
      ],
      /version 0\.9 must be higher/,
    ],
    [
      'supersedes with an earlier effective date',
      [
        doc('it/it-example.md', {
          version: "'2.0'",
          effectiveDate: '2024-01-01',
          supersedes: "'1.0'",
        }),
        doc('it/it-example.v1.0.md', { status: 'superseded' }),
      ],
      /effectiveDate must be later/,
    ],
    [
      'superseded version nobody replaces',
      [doc('it/it-example.v1.0.md', { status: 'superseded' })],
      /no version of it-example supersedes 1\.0/,
    ],
  ])('reports %s', (_name, docs, expected) => {
    expect(problems(docs).join('\n')).toMatch(expected);
  });

  it('reports a domain the taxonomy does not use', () => {
    expect(findDocumentProblems([doc('it/it-example.md')], new Set(['HR'])).join('\n')).toMatch(
      /not used by config\/taxonomy\.yaml/,
    );
  });
});

describe('composition and README', () => {
  const real = loadCorpus().docs;

  it('reports each missing section Q element', () => {
    const tiny = [doc('it/it-example.md')];
    expect(findCompositionProblems(tiny)).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/corpus has 1 documents/),
        expect.stringMatching(/0 US\/UK topic pairs/),
        expect.stringMatching(/0 superseded documents/),
        expect.stringMatching(/0 documents with tables/),
        'required document it-battery-safety is missing or not active',
        'required document it-access-requests is missing or not active',
      ]),
    );
  });

  it('detects Markdown tables', () => {
    expect(hasTable('| a | b |\n| --- | :-: |\n| 1 | 2 |')).toBe(true);
    expect(hasTable('a | b')).toBe(false);
  });

  const readme = (inventory: string, extra = '') =>
    withInventory(
      `## Deliberately missing topics\n\n- One\n- Two\n- Three\n\n## Planted injection\n\n- \`it-office-printing\`: planted\n${extra}\n## Inventory\n\n<!-- inventory:start -->\n<!-- inventory:end -->\n`,
      inventory,
    );

  it('accepts an up-to-date README, even after Prettier pads the table', () => {
    const padded = inventoryTable(real)
      .split('\n')
      .map((line) => line.replace(/ \| /g, '   |   ').replace(/---/g, '--------'))
      .join('\n');
    expect(findReadmeProblems(real, readme(padded))).toEqual([]);
    expect(tableCells(padded)).toEqual(tableCells(inventoryTable(real)));
  });

  it('reports a stale inventory, wrong missing-topic count and a bad injection reference', () => {
    const stale = inventoryTable(real.slice(1));
    const bad = withInventory(
      '## Deliberately missing topics\n\n- Only one\n\n## Planted injection\n\n- `nope`\n\n<!-- inventory:start -->\n<!-- inventory:end -->\n',
      stale,
    );
    expect(findReadmeProblems(real, bad)).toEqual([
      'corpus/README.md: inventory table is out of date; run npm run corpus:validate -- --write',
      'corpus/README.md: lists 1 deliberately missing topics; expected 3–4',
      'corpus/README.md: planted injection document nope is not an active corpus document',
    ]);
  });
});

describe('loadCorpus', () => {
  it('turns unreadable files into problems instead of throwing', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sd-corpus-'));
    try {
      fs.mkdirSync(path.join(dir, 'it'));
      fs.writeFileSync(path.join(dir, 'it', 'it-example.md'), md());
      fs.writeFileSync(path.join(dir, 'it', 'broken.md'), 'no frontmatter');
      fs.writeFileSync(path.join(dir, 'it', 'notes.txt'), 'x');
      const { docs, problems } = loadCorpus(dir);
      expect(docs.map((d) => d.file)).toEqual(['it/it-example.md']);
      expect(problems).toEqual([
        'it/broken.md: missing YAML frontmatter (--- … ---)',
        'it/notes.txt: only Markdown (.md) files belong in the corpus',
        'missing folder corpus/hr',
      ]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('reads the real corpus directory', () => {
    expect(fs.existsSync(CORPUS_DIR)).toBe(true);
  });
});
