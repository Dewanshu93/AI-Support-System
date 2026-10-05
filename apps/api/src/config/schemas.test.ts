import fs from 'node:fs';
import path from 'node:path';
import { load } from 'js-yaml';
import type { z } from 'zod';
import { formatIssues } from './errors';
import { DEFAULT_CONFIG_DIR } from './index';
import { CONFIG_FILES } from './schemas';

type FileKey = keyof typeof CONFIG_FILES;

/** The committed config files are the valid fixtures; invalid ones are mutated copies. */
function fixture(key: FileKey): Record<string, unknown> {
  const raw = fs.readFileSync(path.join(DEFAULT_CONFIG_DIR, CONFIG_FILES[key].file), 'utf8');
  return load(raw) as Record<string, unknown>;
}

function issuesFor(key: FileKey, data: unknown): string {
  const result = (CONFIG_FILES[key].schema as z.ZodType).safeParse(data);
  return result.success ? '' : formatIssues(result.error.issues);
}

describe.each(Object.keys(CONFIG_FILES) as FileKey[])('%s schema', (key) => {
  it('accepts the committed config file', () => {
    expect(issuesFor(key, fixture(key))).toBe('');
  });

  it('rejects an unknown top-level key', () => {
    expect(issuesFor(key, { ...fixture(key), unexpected: true })).toContain('unexpected');
  });

  it('rejects an unsupported version', () => {
    expect(issuesFor(key, { ...fixture(key), version: 2 })).toContain('version');
  });
});

// Each case mutates a valid fixture and names the message fragment expected.
type Case = [string, FileKey, (data: any) => void, string]; // eslint-disable-line @typescript-eslint/no-explicit-any

const invalidCases: Case[] = [
  [
    'taxonomy: duplicate category',
    'taxonomy',
    (d) => d.categories.push(d.categories[0]),
    'duplicate id "hardware"',
  ],
  [
    'taxonomy: unknown domain',
    'taxonomy',
    (d) => (d.categories[0].domain = 'FINANCE'),
    'categories.0.domain',
  ],
  [
    'taxonomy: bad id format',
    'taxonomy',
    (d) => (d.categories[0].id = 'Hard Ware'),
    'lower_snake_case',
  ],
  [
    'taxonomy: no subcategories',
    'taxonomy',
    (d) => (d.categories[0].subcategories = []),
    'categories.0.subcategories',
  ],
  [
    'routing: route to unknown queue',
    'routing',
    (d) => (d.routes.hardware = 'it_nowhere'),
    'routes.hardware: unknown queue "it_nowhere"',
  ],
  [
    'routing: unknown sensitive queue',
    'routing',
    (d) => (d.sensitiveQueue = 'hr_nowhere'),
    'sensitiveQueue: unknown queue',
  ],
  [
    'routing: duplicate queue',
    'routing',
    (d) => d.queues.push(d.queues[0]),
    'duplicate id "it_hardware"',
  ],
  [
    'priority-rules: invalid regex',
    'priorityRules',
    (d) => (d.floors[0].patterns = ['(unclosed']),
    'not a valid regular expression',
  ],
  [
    'priority-rules: unknown floor',
    'priorityRules',
    (d) => (d.floors[0].floor = 'urgent'),
    'floors.0.floor',
  ],
  ['priority-rules: unknown kind', 'priorityRules', (d) => (d.floors[0].kind = 'mood'), 'floors.0'],
  ['sensitive: unknown topic', 'sensitive', (d) => (d.rules[0].topic = 'gossip'), 'rules.0.topic'],
  ['sensitive: empty patterns', 'sensitive', (d) => (d.rules[0].patterns = []), 'rules.0.patterns'],
  [
    'thresholds: partial above answer',
    'thresholds',
    (d) => (d.decision.partialMinRelevance = 3),
    'must not exceed answerMinRelevance',
  ],
  [
    'thresholds: relevance out of scale',
    'thresholds',
    (d) => (d.decision.answerMinRelevance = 4),
    'decision.answerMinRelevance',
  ],
  [
    'thresholds: context larger than fused',
    'thresholds',
    (d) => (d.retrieval.contextTopK = 50),
    'must not exceed fusedTopK',
  ],
  [
    'thresholds: candidates below limit',
    'thresholds',
    (d) => (d.retrieval.vectorNumCandidates = 5),
    'must be at least vectorLimit',
  ],
  [
    'thresholds: non-integer limit',
    'thresholds',
    (d) => (d.retrieval.vectorLimit = 2.5),
    'retrieval.vectorLimit',
  ],
  [
    'ticket-schemas: duplicate field',
    'ticketSchemas',
    (d) => d.schemas.hardware.fields.push(d.schemas.hardware.fields[0]),
    'duplicate id "device_model"',
  ],
  [
    'ticket-schemas: missing required flag',
    'ticketSchemas',
    (d) => delete d.schemas.hardware.fields[0].required,
    'schemas.hardware.fields.0.required',
  ],
  ['prompts: none active', 'prompts', (d) => (d.active = {}), 'active'],
  ['prompts: version zero', 'prompts', (d) => (d.active.turn_analysis = 0), 'active.turn_analysis'],
  ['prompts: unknown prompt', 'prompts', (d) => (d.active.sentiment = 1), 'sentiment'],
  ['models: unknown provider', 'models', (d) => (d.chat.provider = 'acme'), 'chat.provider'],
  [
    'models: missing tier',
    'models',
    (d) => delete d.chat.models.openrouter.quality,
    'chat.models.openrouter.quality',
  ],
  [
    'models: openrouter embeddings',
    'models',
    (d) => (d.embeddings.provider = 'openrouter'),
    'embeddings.provider',
  ],
  ['models: zero dimension', 'models', (d) => (d.embeddings.dimension = 0), 'embeddings.dimension'],
  [
    'templates: missing template',
    'templates',
    (d) => delete d.templates.generic_error,
    'templates.generic_error',
  ],
  [
    'templates: missing placeholder',
    'templates',
    (d) => (d.templates.ticket_confirmed = 'Ticket created.'),
    'must contain the placeholder {ticketHumanId}',
  ],
];

describe('invalid fixtures', () => {
  it.each(invalidCases)('%s', (_name, key, mutate, expected) => {
    const data = fixture(key);
    mutate(data);
    expect(issuesFor(key, data)).toContain(expected);
  });
});
