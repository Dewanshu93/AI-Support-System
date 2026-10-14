// In-memory eval runs and results for API tests (W4-05).
import type { ObjectId } from 'mongodb';
import type { EvalResultDoc, EvalRunDoc } from '../../src/db/schemas';
import type { EvalsRepository } from '../../src/modules/evals/repository';
import { createEvalsService, type EvalLauncher } from '../../src/modules/evals/service';
import type { AppDeps } from '../../src/deps';

const ACTIVE = ['queued', 'running'];

export function memoryEvalsRepository(
  runs: EvalRunDoc[] = [],
  results: EvalResultDoc[] = [],
): EvalsRepository & { runs: EvalRunDoc[]; results: EvalResultDoc[] } {
  const byId = (id: ObjectId) => runs.find((r) => r._id.equals(id));
  return {
    runs,
    results,
    insertRun: async (run) => void runs.push(run),
    activeRun: async () => runs.find((r) => ACTIVE.includes(r.status)) ?? null,
    findRun: async (id) => runs.find((r) => r._id.toHexString() === id) ?? null,
    async listRuns(filter, { limit, cursor }) {
      const sorted = runs
        .filter((r) => !filter.suite || r.suite === filter.suite)
        .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime());
      const start = cursor ? sorted.findIndex((r) => r._id.toHexString() === cursor) + 1 : 0;
      const items = sorted.slice(start, start + limit);
      return {
        items,
        nextCursor:
          start + limit < sorted.length ? items[items.length - 1]!._id.toHexString() : null,
      };
    },
    async listResults(runId, filter, { limit, cursor }) {
      const all = results.filter(
        (r) =>
          r.runId.equals(runId) &&
          (filter.passed === undefined || r.passed === filter.passed) &&
          (!filter.category || r.category === filter.category),
      );
      const start = cursor ? all.findIndex((r) => r._id.toHexString() === cursor) + 1 : 0;
      const items = all.slice(start, start + limit);
      return {
        items,
        nextCursor: start + limit < all.length ? items[items.length - 1]!._id.toHexString() : null,
      };
    },
    async failRun(id, error) {
      const run = byId(id);
      if (run && ACTIVE.includes(run.status))
        Object.assign(run, { status: 'failed', error, passed: false, finishedAt: new Date() });
    },
    activeRuns: async () => runs.filter((r) => ACTIVE.includes(r.status)),
  };
}

/** Evals deps for buildTestApp; without a launcher a start answers 503. */
export function testEvals(
  options: { repository?: EvalsRepository; launcher?: EvalLauncher } = {},
): AppDeps['evals'] {
  const repository = options.repository ?? memoryEvalsRepository();
  return {
    repository,
    service: createEvalsService({ repository, launcher: options.launcher }),
  };
}
