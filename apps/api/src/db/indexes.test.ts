import type { Db, Document } from 'mongodb';
import { COLLECTIONS, type CollectionKey } from './collections';
import {
  chunkSearchIndexes,
  ensureRegularIndexes,
  ensureSearchIndexes,
  REGULAR_INDEXES,
  SEARCH_INDEX_NAMES,
  waitForSearchIndexes,
} from './indexes';
import { CHUNK_FILTER_FIELDS } from './schemas';

const cursor = (docs: Document[]) => ({ toArray: async () => docs });

describe('index definitions (playbook section 3)', () => {
  it('covers every collection', () => {
    expect(Object.keys(REGULAR_INDEXES).sort()).toEqual(Object.keys(COLLECTIONS).sort());
  });

  it('uses unique names within each collection', () => {
    for (const specs of Object.values(REGULAR_INDEXES)) {
      const names = specs.map((s) => s.name);
      expect(new Set(names).size).toBe(names.length);
    }
  });

  it.each<[CollectionKey, Record<string, number>, object]>([
    ['users', { email: 1 }, { unique: true }],
    ['documents', { slug: 1, version: 1 }, { unique: true }],
    ['chunks', { documentId: 1, ordinal: 1 }, { unique: true }],
    ['turnTraces', { messageId: 1 }, { unique: true }],
    ['tickets', { humanId: 1 }, { unique: true }],
    ['tickets', { conversationId: 1 }, { unique: true, sparse: true }],
    ['feedback', { messageId: 1, userId: 1 }, { unique: true }],
    ['evalResults', { runId: 1, caseId: 1 }, { unique: true }],
  ])('%s has unique index %j', (collection, key, options) => {
    const spec = REGULAR_INDEXES[collection].find(
      (s) => JSON.stringify(s.key) === JSON.stringify(key),
    );
    expect(spec).toMatchObject(options);
  });

  it('defines the eval-isolation and queue indexes', () => {
    const keys = (c: CollectionKey) => REGULAR_INDEXES[c].map((s) => s.key);
    expect(keys('conversations')).toContainEqual({ isEval: 1, createdAt: -1 });
    expect(keys('tickets')).toContainEqual({ queue: 1, status: 1, priority: -1, createdAt: 1 });
    expect(keys('tickets')).toContainEqual({ requesterId: 1, category: 1, status: 1 });
    expect(keys('turnTraces')).toContainEqual({ 'decision.value': 1, createdAt: -1 });
  });

  it('builds the vector index with the configured dimension, cosine and access filters', () => {
    const [vector] = chunkSearchIndexes(768);
    expect(vector).toMatchObject({ name: SEARCH_INDEX_NAMES.vector, type: 'vectorSearch' });
    const fields = vector!.definition.fields as Document[];
    expect(fields[0]).toEqual({
      type: 'vector',
      path: 'embedding',
      numDimensions: 768,
      similarity: 'cosine',
    });
    expect(fields.slice(1).map((f) => f.path)).toEqual([...CHUNK_FILTER_FIELDS]);
  });

  it('builds the text index on contextualText with filterable token fields', () => {
    const [, text] = chunkSearchIndexes(768);
    expect(text).toMatchObject({ name: SEARCH_INDEX_NAMES.text, type: 'search' });
    const fields = text!.definition.mappings.fields as Record<string, Document>;
    expect(fields.contextualText).toEqual({ type: 'string', analyzer: 'lucene.standard' });
    for (const path of CHUNK_FILTER_FIELDS) expect(fields[path]).toEqual({ type: 'token' });
  });
});

describe('ensureRegularIndexes', () => {
  function fakeDb(existing: Record<string, Document[]>) {
    const createdCalls: Record<string, Document[]> = {};
    const db = {
      collection: (name: string) => ({
        collectionName: name,
        listIndexes: () => cursor([{ name: '_id_', key: { _id: 1 } }, ...(existing[name] ?? [])]),
        createIndexes: async (specs: Document[]) => {
          createdCalls[name] = specs;
          existing[name] = [...(existing[name] ?? []), ...specs];
        },
      }),
    } as unknown as Db;
    return { db, createdCalls };
  }

  it('creates every index on an empty database, then nothing on a re-run', async () => {
    const existing: Record<string, Document[]> = {};
    const { db } = fakeDb(existing);
    const first = await ensureRegularIndexes(db);
    const total = Object.values(REGULAR_INDEXES).reduce((n, specs) => n + specs.length, 0);
    expect(first).toHaveLength(total);
    expect(first).toContain('users.email_unique');
    expect(await ensureRegularIndexes(db)).toEqual([]);
  });

  it('creates only the missing indexes', async () => {
    const { db, createdCalls } = fakeDb({
      users: [{ name: 'email_unique', key: { email: 1 }, unique: true }],
    });
    await ensureRegularIndexes(db);
    expect(createdCalls.users!.map((s) => s.name)).toEqual(['role']);
  });

  it('refuses an index whose name matches but key differs', async () => {
    const { db } = fakeDb({ users: [{ name: 'email_unique', key: { name: 1 } }] });
    await expect(ensureRegularIndexes(db)).rejects.toThrow(
      /users\.email_unique exists with key \{"name":1\}/,
    );
  });
});

describe('ensureSearchIndexes', () => {
  function fakeChunks(existing: Document[]) {
    const created: string[] = [];
    return {
      created,
      chunks: {
        listSearchIndexes: () => cursor(existing),
        createSearchIndex: async (d: Document) => {
          created.push(d.name);
          return d.name;
        },
      } as never,
    };
  }

  it('creates both indexes when missing and none when present', async () => {
    const empty = fakeChunks([]);
    expect(await ensureSearchIndexes(empty.chunks, 768)).toEqual([
      'chunks.chunks_vector',
      'chunks.chunks_text',
    ]);

    const present = fakeChunks([
      {
        name: 'chunks_vector',
        latestDefinition: { fields: [{ type: 'vector', numDimensions: 768 }] },
      },
      { name: 'chunks_text' },
    ]);
    expect(await ensureSearchIndexes(present.chunks, 768)).toEqual([]);
    expect(present.created).toEqual([]);
  });

  it('refuses a silent embedding-dimension change', async () => {
    const { chunks } = fakeChunks([
      {
        name: 'chunks_vector',
        latestDefinition: { fields: [{ type: 'vector', numDimensions: 3072 }] },
      },
      { name: 'chunks_text' },
    ]);
    await expect(ensureSearchIndexes(chunks, 768)).rejects.toThrow(/full re-index/);
  });
});

describe('waitForSearchIndexes', () => {
  const names = ['chunks_vector', 'chunks_text'];

  it('resolves once every index is queryable', async () => {
    let polls = 0;
    const chunks = {
      listSearchIndexes: () => {
        polls++;
        const queryable = polls >= 3;
        return cursor(
          names.map((name) => ({ name, status: queryable ? 'READY' : 'BUILDING', queryable })),
        );
      },
    } as never;
    await waitForSearchIndexes(chunks, names, { intervalMs: 1, timeoutMs: 1000 });
    expect(polls).toBe(3);
  });

  it('fails fast when a build fails', async () => {
    const chunks = {
      listSearchIndexes: () => cursor([{ name: 'chunks_vector', status: 'FAILED' }]),
    } as never;
    await expect(waitForSearchIndexes(chunks, names, { intervalMs: 1 })).rejects.toThrow(
      'Search index build failed: chunks_vector',
    );
  });

  it('times out naming the pending indexes', async () => {
    const chunks = {
      listSearchIndexes: () => cursor([{ name: 'chunks_vector', queryable: true }]),
    } as never;
    await expect(
      waitForSearchIndexes(chunks, names, { intervalMs: 1, timeoutMs: 20 }),
    ).rejects.toThrow('Timed out waiting for search indexes: chunks_text');
  });
});
