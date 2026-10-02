import type { Db, Document } from 'mongodb';
import { COLLECTIONS, type CollectionKey } from './collections';
import { ensureRegularIndexes, REGULAR_INDEXES } from './indexes';

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
