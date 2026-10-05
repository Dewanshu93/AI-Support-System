// Real-MongoDB tests for the users/audit repositories and the seed. Skipped
// unless MONGODB_TEST_URI is set; uses a throwaway database dropped afterwards.
import { randomBytes } from 'node:crypto';
import { ObjectId } from 'mongodb';
import {
  connectDatabase,
  type Database,
  ensureCollections,
  ensureRegularIndexes,
  getCollections,
} from '../../src/db';
import { mongoAuditRepository } from '../../src/modules/audit/repository';
import { mongoUsersRepository } from '../../src/modules/users/repository';
import { loadSeedUsers, seedUsers } from '../../src/modules/users/seed';

const mongoUri = process.env.MONGODB_TEST_URI;
jest.setTimeout(120_000);

(mongoUri ? describe : describe.skip)('users, audit and seed (integration)', () => {
  let database: Database;

  beforeAll(async () => {
    database = await connectDatabase(mongoUri!, {
      dbName: `servicedesk_test_${randomBytes(4).toString('hex')}`,
      appName: 'users-integration-test',
    });
    await ensureCollections(database.db);
    await ensureRegularIndexes(database.db);
  });

  afterAll(async () => {
    if (!database) return;
    await database.db.dropDatabase();
    await database.client.close();
  });

  it('seeds all users once; re-running inserts nothing and keeps createdAt', async () => {
    const { users } = getCollections(database.db);
    const seed = loadSeedUsers();
    const first = await seedUsers(users, seed, new Date('2026-10-01T00:00:00Z'));
    expect(first).toEqual({ inserted: 8, updated: 0, unchanged: 0 });

    const second = await seedUsers(users, seed, new Date('2026-12-31T00:00:00Z'));
    expect(second).toEqual({ inserted: 0, updated: 0, unchanged: 8 });

    expect(await users.countDocuments()).toBe(8);
    const priya = await users.findOne({ email: 'priya.shah@example.com' });
    expect(priya?.createdAt.toISOString()).toBe('2026-10-01T00:00:00.000Z');
  });

  it('updates changed profile fields on re-seed', async () => {
    const { users } = getCollections(database.db);
    const seed = loadSeedUsers().map((u) =>
      u.email === 'tom.clarke@example.com' ? { ...u, jobTitle: 'Senior Content Designer' } : u,
    );
    expect(await seedUsers(users, seed)).toEqual({ inserted: 0, updated: 1, unchanged: 7 });
    await seedUsers(users, loadSeedUsers());
  });

  it('finds users by id, by case-insensitive email, and lists demo users', async () => {
    const repo = mongoUsersRepository(getCollections(database.db).users);
    const sam = await repo.findByEmail('SAM.PATEL@example.com');
    expect(sam?.role).toBe('agent');
    expect((await repo.findById(sam!._id.toHexString()))?.email).toBe('sam.patel@example.com');
    expect(await repo.findById('not-an-id')).toBeNull();
    expect(await repo.findById(new ObjectId().toHexString())).toBeNull();
    expect(await repo.listDemo()).toHaveLength(8);
  });

  it('appends validated audit entries and rejects invalid ones', async () => {
    const { auditLog } = getCollections(database.db);
    const repo = mongoAuditRepository(auditLog);
    const entry = {
      _id: new ObjectId(),
      actorId: new ObjectId(),
      actorRole: 'admin' as const,
      action: 'auth.login',
      targetType: 'user',
      targetId: 'x',
      metadata: {},
      ip: '127.0.0.1',
      requestId: 'r-1',
      createdAt: new Date(),
    };
    await repo.insert(entry);
    expect(await auditLog.countDocuments({ action: 'auth.login' })).toBe(1);
    await expect(repo.insert({ ...entry, _id: new ObjectId(), action: 'LOGIN' })).rejects.toThrow(
      /Invalid audit_log document: action/,
    );
  });
});
