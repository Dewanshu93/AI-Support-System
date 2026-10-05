// Corpus loader and validator (W1-07). Ingestion (W1-10) reuses parseCorpusFile.
import fs from 'node:fs';
import path from 'node:path';
import { compareVersions, type DocumentMetadata, DocumentMetadataSchema } from '@sd/shared';
import { load, YAMLException } from 'js-yaml';
import { REPO_ROOT } from '../../config';

export const CORPUS_DIR = path.join(REPO_ROOT, 'corpus');
export const CORPUS_README = path.join(CORPUS_DIR, 'README.md');

/** Domain subfolders; a document must live in the folder of its domain. */
export const DOMAIN_FOLDERS = { it: 'IT', hr: 'HR' } as const;

/** Section Q composition (summarised on the W1-07 card). */
export const CORPUS_RULES = {
  minDocuments: 30,
  maxDocuments: 40,
  minCountryPairs: 6,
  minSuperseded: 2,
  minWithTables: 3,
  requiredSlugs: ['it-battery-safety', 'it-access-requests'],
  missingTopics: { min: 3, max: 4 },
} as const;

export const INVENTORY_START = '<!-- inventory:start -->';
export const INVENTORY_END = '<!-- inventory:end -->';

export interface CorpusDoc {
  /** Path relative to the corpus directory, with forward slashes. */
  file: string;
  meta: DocumentMetadata;
  /** Markdown after the frontmatter. */
  body: string;
}

export class CorpusFileError extends Error {
  override name = 'CorpusFileError';
}

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;
/** A UTF-8 byte-order mark (U+FEFF) can precede the frontmatter. */
const stripBom = (text: string) => (text.charCodeAt(0) === 0xfeff ? text.slice(1) : text);

const TABLE_SEPARATOR = /^\s*\|(\s*:?-+:?\s*\|)+\s*$/m;

export function hasTable(body: string): boolean {
  return TABLE_SEPARATOR.test(body);
}

/** Splits and validates the YAML frontmatter; every failure names the file. */
export function parseCorpusFile(file: string, text: string): CorpusDoc {
  const match = FRONTMATTER.exec(stripBom(text));
  if (!match) throw new CorpusFileError(`${file}: missing YAML frontmatter (--- … ---)`);

  let data: unknown;
  try {
    data = load(match[1]!, { filename: file });
  } catch (err) {
    if (err instanceof YAMLException) {
      const where = err.mark ? ` at line ${err.mark.line + 2}` : '';
      throw new CorpusFileError(`${file}: malformed frontmatter${where}: ${err.reason}`);
    }
    throw err;
  }

  const result = DocumentMetadataSchema.safeParse(data);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `${i.path.map(String).join('.') || '(root)'}: ${i.message}`)
      .join('; ');
    throw new CorpusFileError(`${file}: invalid frontmatter: ${issues}`);
  }
  return { file, meta: result.data, body: match[2]!.trim() };
}

/** Reads every Markdown file under the domain folders. Unparseable files become problems. */
export function loadCorpus(dir: string = CORPUS_DIR): { docs: CorpusDoc[]; problems: string[] } {
  const docs: CorpusDoc[] = [];
  const problems: string[] = [];
  for (const folder of Object.keys(DOMAIN_FOLDERS)) {
    const folderPath = path.join(dir, folder);
    if (!fs.existsSync(folderPath)) {
      problems.push(`missing folder corpus/${folder}`);
      continue;
    }
    for (const name of fs.readdirSync(folderPath).sort()) {
      if (!name.endsWith('.md')) {
        problems.push(`${folder}/${name}: only Markdown (.md) files belong in the corpus`);
        continue;
      }
      const file = `${folder}/${name}`;
      try {
        docs.push(parseCorpusFile(file, fs.readFileSync(path.join(folderPath, name), 'utf8')));
      } catch (err) {
        if (err instanceof CorpusFileError) problems.push(err.message);
        else throw err;
      }
    }
  }
  return { docs, problems };
}

/** Active documents are `<slug>.md`; other versions are `<slug>.v<version>.md`. */
export function expectedFileName(meta: DocumentMetadata): string {
  return meta.status === 'active' ? `${meta.slug}.md` : `${meta.slug}.v${meta.version}.md`;
}

const docId = (meta: DocumentMetadata) => `${meta.slug}@${meta.version}`;

/** Per-document and cross-document rules. Returns one message per problem. */
export function findDocumentProblems(
  docs: CorpusDoc[],
  taxonomyDomains: ReadonlySet<string>,
): string[] {
  const problems: string[] = [];
  const byId = new Map<string, CorpusDoc>();

  for (const doc of docs) {
    const { meta, file } = doc;
    const [folder, name] = file.split('/');
    const folderDomain = DOMAIN_FOLDERS[folder as keyof typeof DOMAIN_FOLDERS];
    if (folderDomain !== meta.domain) {
      problems.push(`${file}: domain ${meta.domain} does not match folder ${folder}/`);
    }
    if (!taxonomyDomains.has(meta.domain)) {
      problems.push(`${file}: domain ${meta.domain} is not used by config/taxonomy.yaml`);
    }
    if (name !== expectedFileName(meta)) {
      problems.push(`${file}: file name should be ${expectedFileName(meta)}`);
    }
    if (!/^## \S/m.test(doc.body)) {
      problems.push(`${file}: needs at least one "## " section heading (chunking splits on them)`);
    }
    if (/^# \S/m.test(doc.body)) {
      problems.push(`${file}: do not use a "# " heading; the title comes from frontmatter`);
    }
    if (meta.slug.endsWith('-us') && (meta.countries.length !== 1 || meta.countries[0] !== 'US')) {
      problems.push(`${file}: a "-us" slug must have countries [US]`);
    }
    if (meta.slug.endsWith('-uk') && (meta.countries.length !== 1 || meta.countries[0] !== 'UK')) {
      problems.push(`${file}: a "-uk" slug must have countries [UK]`);
    }
    if (byId.has(docId(meta))) {
      problems.push(
        `${file}: duplicate slug and version ${docId(meta)} (also ${byId.get(docId(meta))!.file})`,
      );
    }
    byId.set(docId(meta), doc);
  }

  const bySlug = new Map<string, CorpusDoc[]>();
  for (const doc of docs) bySlug.set(doc.meta.slug, [...(bySlug.get(doc.meta.slug) ?? []), doc]);

  for (const [slug, versions] of bySlug) {
    const active = versions.filter((d) => d.meta.status === 'active');
    if (active.length > 1) {
      problems.push(
        `${slug}: ${active.length} active versions (${active.map((d) => d.meta.version).join(', ')}); only one is allowed`,
      );
    }
    for (const doc of versions) {
      const { meta } = doc;
      if (meta.supersedes !== null) {
        const old = byId.get(`${slug}@${meta.supersedes}`);
        if (!old) {
          problems.push(
            `${doc.file}: supersedes ${slug}@${meta.supersedes}, which is not in the corpus`,
          );
        } else {
          if (old.meta.status !== 'superseded') {
            problems.push(
              `${doc.file}: supersedes ${slug}@${meta.supersedes}, which must have status superseded`,
            );
          }
          if (compareVersions(meta.version, meta.supersedes) <= 0) {
            problems.push(
              `${doc.file}: version ${meta.version} must be higher than the version it supersedes (${meta.supersedes})`,
            );
          }
          if (meta.effectiveDate <= old.meta.effectiveDate) {
            problems.push(
              `${doc.file}: effectiveDate must be later than that of ${slug}@${meta.supersedes}`,
            );
          }
        }
      }
      if (
        meta.status === 'superseded' &&
        !versions.some((d) => d.meta.supersedes === meta.version)
      ) {
        problems.push(
          `${doc.file}: status superseded but no version of ${slug} supersedes ${meta.version}`,
        );
      }
    }
  }
  return problems;
}

/** Section Q composition counts. */
export function corpusComposition(docs: CorpusDoc[]) {
  const active = docs.filter((d) => d.meta.status === 'active');
  const activeSlugs = new Set(active.map((d) => d.meta.slug));
  const countryPairs = [...activeSlugs]
    .filter((s) => s.endsWith('-us') && activeSlugs.has(`${s.slice(0, -3)}-uk`))
    .map((s) => s.slice(0, -3))
    .sort();
  return {
    total: docs.length,
    active: active.length,
    superseded: docs.filter((d) => d.meta.status === 'superseded').length,
    byDomain: {
      IT: docs.filter((d) => d.meta.domain === 'IT').length,
      HR: docs.filter((d) => d.meta.domain === 'HR').length,
    },
    countryPairs,
    withTables: docs.filter((d) => hasTable(d.body)).map((d) => d.meta.slug),
    contractorOnly: active
      .filter(
        (d) => d.meta.employmentTypes.length === 1 && d.meta.employmentTypes[0] === 'contractor',
      )
      .map((d) => d.meta.slug),
    managerOnly: active.filter((d) => d.meta.accessLevel === 'manager').map((d) => d.meta.slug),
  };
}

export function findCompositionProblems(docs: CorpusDoc[]): string[] {
  const c = corpusComposition(docs);
  const r = CORPUS_RULES;
  const problems: string[] = [];
  if (c.total < r.minDocuments || c.total > r.maxDocuments) {
    problems.push(
      `corpus has ${c.total} documents; section Q expects ${r.minDocuments}–${r.maxDocuments}`,
    );
  }
  if (c.countryPairs.length < r.minCountryPairs) {
    problems.push(
      `${c.countryPairs.length} US/UK topic pairs; at least ${r.minCountryPairs} required`,
    );
  }
  if (c.superseded < r.minSuperseded) {
    problems.push(`${c.superseded} superseded documents; at least ${r.minSuperseded} required`);
  }
  if (c.withTables.length < r.minWithTables) {
    problems.push(
      `${c.withTables.length} documents with tables; at least ${r.minWithTables} required`,
    );
  }
  const activeSlugs = new Set(
    docs.filter((d) => d.meta.status === 'active').map((d) => d.meta.slug),
  );
  for (const slug of r.requiredSlugs) {
    if (!activeSlugs.has(slug)) problems.push(`required document ${slug} is missing or not active`);
  }
  return problems;
}

/** Markdown inventory table kept between the README markers. */
export function inventoryTable(docs: CorpusDoc[]): string {
  const sorted = [...docs].sort(
    (a, b) =>
      a.meta.domain.localeCompare(b.meta.domain) ||
      a.meta.slug.localeCompare(b.meta.slug) ||
      compareVersions(b.meta.version, a.meta.version),
  );
  const rows = sorted.map(({ meta }) =>
    [
      `\`${meta.slug}\``,
      meta.title,
      meta.domain,
      meta.version,
      meta.status,
      meta.effectiveDate.toISOString().slice(0, 10),
      meta.countries.join(', '),
      meta.employmentTypes.map((t) => (t === 'full_time' ? 'full-time' : t)).join(', '),
      meta.accessLevel,
    ].join(' | '),
  );
  return [
    '| Slug | Title | Domain | Version | Status | Effective | Countries | Employment | Access |',
    '| --- | --- | --- | --- | --- | --- | --- | --- | --- |',
    ...rows.map((r) => `| ${r} |`),
  ].join('\n');
}

/** Replaces the text between the inventory markers. */
export function withInventory(readme: string, table: string): string {
  const start = readme.indexOf(INVENTORY_START);
  const end = readme.indexOf(INVENTORY_END);
  if (start < 0 || end < start) throw new Error('corpus/README.md has no inventory markers');
  return `${readme.slice(0, start + INVENTORY_START.length)}\n\n${table}\n\n${readme.slice(end)}`;
}

/** Trimmed cells of each table row, ignoring padding and separator rows (Prettier-proof). */
export function tableCells(markdown: string): string[][] {
  return markdown
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith('|') && !/^\|(\s*:?-+:?\s*\|)+$/.test(line))
    .map((line) =>
      line
        .slice(1, line.endsWith('|') ? -1 : undefined)
        .split('|')
        .map((cell) => cell.trim()),
    );
}

/** Bullet items under a "## <heading>" section of the README. */
export function readmeSectionItems(readme: string, heading: string): string[] {
  const lines = readme.split(/\r?\n/);
  const at = lines.findIndex((l) => l.trim() === `## ${heading}`);
  if (at < 0) return [];
  const items: string[] = [];
  for (const line of lines.slice(at + 1)) {
    if (line.startsWith('## ')) break;
    const m = /^\s*[-*]\s+(.*)$/.exec(line);
    if (m) items.push(m[1]!.trim());
  }
  return items;
}

/** README must carry an up-to-date inventory, the missing topics and the planted injection. */
export function findReadmeProblems(docs: CorpusDoc[], readme: string): string[] {
  const problems: string[] = [];
  const start = readme.indexOf(INVENTORY_START);
  const end = readme.indexOf(INVENTORY_END);
  if (start < 0 || end < start) {
    problems.push('corpus/README.md: inventory markers are missing');
  } else if (
    JSON.stringify(tableCells(readme.slice(start + INVENTORY_START.length, end))) !==
    JSON.stringify(tableCells(inventoryTable(docs)))
  ) {
    problems.push(
      'corpus/README.md: inventory table is out of date; run npm run corpus:validate -- --write',
    );
  }

  const missing = readmeSectionItems(readme, 'Deliberately missing topics');
  const { min, max } = CORPUS_RULES.missingTopics;
  if (missing.length < min || missing.length > max) {
    problems.push(
      `corpus/README.md: lists ${missing.length} deliberately missing topics; expected ${min}–${max}`,
    );
  }

  const injection = readmeSectionItems(readme, 'Planted injection');
  const slugs = injection.flatMap((item) =>
    [...item.matchAll(/`([a-z0-9-]+)`/g)].map((m) => m[1]!),
  );
  const activeSlugs = new Set(
    docs.filter((d) => d.meta.status === 'active').map((d) => d.meta.slug),
  );
  if (slugs.length !== 1) {
    problems.push(
      'corpus/README.md: "Planted injection" must name exactly one document slug in backticks',
    );
  } else if (!activeSlugs.has(slugs[0]!)) {
    problems.push(
      `corpus/README.md: planted injection document ${slugs[0]} is not an active corpus document`,
    );
  }
  return problems;
}

/** Every rule: parse problems, per-document rules, composition and README. */
export function validateCorpus(options: {
  dir?: string;
  readme?: string;
  taxonomyDomains: ReadonlySet<string>;
}): { docs: CorpusDoc[]; problems: string[] } {
  const dir = options.dir ?? CORPUS_DIR;
  const { docs, problems } = loadCorpus(dir);
  const readmePath = path.join(dir, 'README.md');
  const readme =
    options.readme ?? (fs.existsSync(readmePath) ? fs.readFileSync(readmePath, 'utf8') : '');
  return {
    docs,
    problems: [
      ...problems,
      ...findDocumentProblems(docs, options.taxonomyDomains),
      ...findCompositionProblems(docs),
      ...(readme ? findReadmeProblems(docs, readme) : ['corpus/README.md is missing']),
    ],
  };
}
