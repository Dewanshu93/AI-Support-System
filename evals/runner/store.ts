// Persists eval runs and per-case results (eval_runs, eval_results).
import { ObjectId } from 'mongodb';
import type { Collections } from '../../apps/api/src/db/collections';
import { validateForWrite } from '../../apps/api/src/db/collections';
import {
  type EvalResultDoc,
  EvalResultSchema,
  type EvalRunDoc,
  EvalRunSchema,
} from '../../apps/api/src/db/schemas';

export type EvalCollections = Pick<Collections, 'evalRuns' | 'evalResults'>;

export function evalStore(collections: EvalCollections) {
  return {
    async createRun(
      run: Omit<EvalRunDoc, '_id' | 'status' | 'finishedAt' | 'error' | 'passed' | 'durationMs'>,
    ) {
      const doc: EvalRunDoc = {
        ...run,
        _id: new ObjectId(),
        status: 'running',
        passed: null,
        durationMs: null,
        finishedAt: null,
        error: null,
      };
      await collections.evalRuns.insertOne(validateForWrite('eval_runs', EvalRunSchema, doc));
      return doc;
    },
    async saveResults(results: EvalResultDoc[]) {
      if (results.length === 0) return;
      await collections.evalResults.insertMany(
        results.map((r) => validateForWrite('eval_results', EvalResultSchema, r)),
        { ordered: true },
      );
    },
    async finishRun(
      id: ObjectId,
      fields: Pick<
        EvalRunDoc,
        'metrics' | 'perCategory' | 'targets' | 'passed' | 'costUsd' | 'durationMs'
      >,
    ) {
      await collections.evalRuns.updateOne(
        { _id: id },
        { $set: { ...fields, status: 'completed', finishedAt: new Date() } },
      );
    },
    async failRun(id: ObjectId, error: string, durationMs: number) {
      await collections.evalRuns.updateOne(
        { _id: id },
        { $set: { status: 'failed', error, durationMs, finishedAt: new Date(), passed: false } },
      );
    },
  };
}
