// Eval runs from the admin UI (W4-05): one run at a time. The API queues the run
// (eval_runs, status queued) and starts the existing runner in the background
// through an injected launcher (server.ts: the eval CLI as a child process, so a
// long run never blocks the API). The runner attaches to the queued run, reports
// progress per case and finishes it; if it exits while the run is still active,
// the run is marked failed here with the last lines of its output.
import type { EvalModelMode, EvalRunStartRequest } from '@sd/shared';
import { ObjectId } from 'mongodb';
import type { EvalRunDoc } from '../../db/schemas';
import { AppError } from '../../lib/errors';
import type { EvalsRepository } from './repository';

export interface EvalLaunch {
  runId: string;
  suite: EvalRunStartRequest['suite'];
  tags: string[];
  caseIds: string[];
  modelMode: EvalModelMode;
}

/** Runs the eval to completion; resolves with its exit code and output tail. */
export type EvalLauncher = (launch: EvalLaunch) => Promise<{ exitCode: number; output: string }>;

/** The API process that launched a run (several APIs may share one database). */
export interface EvalRunOwner {
  host: string;
  pid: number;
}

export interface EvalsServiceDeps {
  repository: EvalsRepository;
  launcher?: EvalLauncher;
  /** This API process; runs it launches are stamped with it. */
  owner?: EvalRunOwner;
  /** Whether a process on this host is still running (process.kill(pid, 0)). */
  isAlive?: (pid: number) => boolean;
  now?: () => Date;
  onError?: (err: unknown) => void;
}

export const INTERRUPTED_ERROR = 'The API restarted while this run was in progress';

export function createEvalsService(deps: EvalsServiceDeps) {
  const now = deps.now ?? (() => new Date());
  let running: Promise<void> = Promise.resolve();

  return {
    /** Queues a run and starts it in the background; 409 while another one is active. */
    async start(
      input: EvalRunStartRequest,
      actor: { id: string; modelMode: EvalModelMode },
    ): Promise<EvalRunDoc> {
      const launcher = deps.launcher;
      if (!launcher) throw new AppError('LLM_UNAVAILABLE', 'Eval runs are not available here');
      const active = await deps.repository.activeRun();
      if (active) {
        throw new AppError('CONFLICT', 'An eval run is already in progress', {
          runId: active._id.toHexString(),
        });
      }
      const filter = { tags: input.tags ?? [], caseIds: input.caseIds ?? [] };
      const run: EvalRunDoc = {
        _id: new ObjectId(),
        suite: input.suite,
        datasetVersion: 'pending',
        status: 'queued',
        configSnapshot: { thresholds: {}, promptVersions: {}, models: {}, gitCommit: 'pending' },
        caseCount: 0,
        completedCases: 0,
        modelMode: actor.modelMode,
        filter,
        ...(deps.owner && { owner: deps.owner }),
        metrics: {},
        perCategory: {},
        targets: {},
        passed: null,
        costUsd: 0,
        durationMs: null,
        triggeredBy: new ObjectId(actor.id),
        startedAt: now(),
        finishedAt: null,
        error: null,
      };
      await deps.repository.insertRun(run);
      running = launcher({
        runId: run._id.toHexString(),
        suite: input.suite,
        ...filter,
        modelMode: actor.modelMode,
      })
        .then(async ({ exitCode, output }) => {
          // A completed run that did not pass also exits 1; only an active run failed.
          const tail = output.trim().split('\n').slice(-5).join('\n');
          await deps.repository.failRun(
            run._id,
            tail || `The eval runner exited with code ${exitCode}`,
          );
        })
        .catch(async (err: unknown) => {
          deps.onError?.(err);
          await deps.repository.failRun(run._id, 'The eval runner could not be started');
        });
      return run;
    },

    /**
     * At startup: fails active runs whose launching API process on this host has
     * gone (its runner died with it). Runs owned by another live API (the dev API
     * and the E2E API share the database) or another host are left alone.
     */
    async failInterrupted(): Promise<number> {
      const owner = deps.owner;
      const alive = deps.isAlive ?? (() => true);
      let failed = 0;
      for (const run of await deps.repository.activeRuns()) {
        const gone = run.owner
          ? owner !== undefined && run.owner.host === owner.host && !alive(run.owner.pid)
          : true; // runs from before owners were recorded
        if (gone) {
          await deps.repository.failRun(run._id, INTERRUPTED_ERROR);
          failed++;
        }
      }
      return failed;
    },

    /** Resolves when the last started run's process has exited. For tests and shutdown. */
    idle: () => running,
  };
}
export type EvalsService = ReturnType<typeof createEvalsService>;
