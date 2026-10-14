// Eval runs and results (W4-05): the admin API queues runs and reads what the
// runner (evals/runner, also `npm run eval`) writes to eval_runs / eval_results.
import { type Collection, ObjectId } from 'mongodb';
import { validateForWrite } from '../../db/collections';
import { type EvalResultDoc, type EvalRunDoc, EvalRunSchema } from '../../db/schemas';

export interface EvalsRepository {
  insertRun(run: EvalRunDoc): Promise<void>;
  /** A queued or running run, if any. */
  activeRun(): Promise<EvalRunDoc | null>;
  findRun(id: string): Promise<EvalRunDoc | null>;
  listRuns(
    filter: { suite?: EvalRunDoc['suite'] },
    page: { limit: number; cursor?: string },
  ): Promise<{ items: EvalRunDoc[]; nextCursor: string | null }>;
  listResults(
    runId: ObjectId,
    filter: { passed?: boolean; category?: string },
    page: { limit: number; cursor?: string },
  ): Promise<{ items: EvalResultDoc[]; nextCursor: string | null }>;
  /** Marks a queued or running run failed (no-op once it finished). */
  failRun(id: ObjectId, error: string): Promise<void>;
  /** Every queued or running run. */
  activeRuns(): Promise<EvalRunDoc[]>;
}

const ACTIVE = { status: { $in: ['queued', 'running'] } } as const;

/** Opaque cursor over (startedAt desc, _id desc). */
const encodeRunCursor = (r: EvalRunDoc) =>
  Buffer.from(`${r.startedAt.toISOString()}|${r._id.toHexString()}`).toString('base64url');
function decodeRunCursor(cursor: string): { startedAt: Date; id: ObjectId } | null {
  const [date, id] = Buffer.from(cursor, 'base64url').toString('utf8').split('|');
  const startedAt = new Date(date ?? '');
  if (!id || !ObjectId.isValid(id) || Number.isNaN(startedAt.getTime())) return null;
  return { startedAt, id: new ObjectId(id) };
}

export function mongoEvalsRepository(c: {
  evalRuns: Collection<EvalRunDoc>;
  evalResults: Collection<EvalResultDoc>;
}): EvalsRepository {
  return {
    async insertRun(run) {
      await c.evalRuns.insertOne(validateForWrite('eval_runs', EvalRunSchema, run));
    },
    activeRun: () => c.evalRuns.findOne(ACTIVE, { sort: { startedAt: -1 } }),
    async findRun(id) {
      return ObjectId.isValid(id) ? c.evalRuns.findOne({ _id: new ObjectId(id) }) : null;
    },
    async listRuns(filter, { limit, cursor }) {
      const query: Record<string, unknown> = {};
      if (filter.suite) query.suite = filter.suite;
      const after = cursor ? decodeRunCursor(cursor) : null;
      if (after) {
        query.$or = [
          { startedAt: { $lt: after.startedAt } },
          { startedAt: after.startedAt, _id: { $lt: after.id } },
        ];
      }
      const docs = await c.evalRuns
        .find(query, { projection: { configSnapshot: 0 } })
        .sort({ startedAt: -1, _id: -1 })
        .limit(limit + 1)
        .toArray();
      const items = docs.slice(0, limit);
      return {
        items,
        nextCursor: docs.length > limit ? encodeRunCursor(items[items.length - 1]!) : null,
      };
    },
    async listResults(runId, filter, { limit, cursor }) {
      const query: Record<string, unknown> = { runId };
      if (filter.passed !== undefined) query.passed = filter.passed;
      if (filter.category) query.category = filter.category;
      if (cursor && ObjectId.isValid(cursor)) query._id = { $gt: new ObjectId(cursor) };
      const docs = await c.evalResults
        .find(query)
        .sort({ _id: 1 })
        .limit(limit + 1)
        .toArray();
      const items = docs.slice(0, limit);
      return {
        items,
        nextCursor: docs.length > limit ? items[items.length - 1]!._id.toHexString() : null,
      };
    },
    async failRun(id, error) {
      await c.evalRuns.updateOne(
        { _id: id, ...ACTIVE },
        { $set: { status: 'failed', error, passed: false, finishedAt: new Date() } },
      );
    },
    activeRuns: () => c.evalRuns.find(ACTIVE).toArray(),
  };
}
