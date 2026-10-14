// W4-05: eval runs from the admin UI — start (queued, launched in the background,
// 409 while one is active), the admin's Pro switch picks the models, list, detail,
// results with filters; a runner that exits early fails the run; admin only.
import { ObjectId } from 'mongodb';
import request from 'supertest';
import type { EvalResultDoc, EvalRunDoc } from '../../src/db/schemas';
import {
  createEvalsService,
  type EvalLaunch,
  type EvalLauncher,
  INTERRUPTED_ERROR,
} from '../../src/modules/evals/service';
import { buildTestApp, loginCookie } from '../helpers/app';
import { memoryEvalsRepository, testEvals } from '../helpers/evals';

const URL = '/api/admin/evals/runs';
const ADMIN = 'alex.morgan@example.com';

/** A launcher that records each launch and finishes only when told to. */
function controlledLauncher() {
  const launches: EvalLaunch[] = [];
  let finish!: (r: { exitCode: number; output: string }) => void;
  const launcher: EvalLauncher = (launch) => {
    launches.push(launch);
    return new Promise((resolve) => (finish = resolve));
  };
  return { launcher, launches, finish: (r = { exitCode: 0, output: '' }) => finish(r) };
}

function completedRun(over: Partial<EvalRunDoc> = {}): EvalRunDoc {
  return {
    _id: new ObjectId(),
    suite: 'retrieval',
    datasetVersion: 'v1',
    status: 'completed',
    configSnapshot: {
      thresholds: {},
      promptVersions: { rerank_assess: 1 },
      models: {},
      gitCommit: 'abc1234',
    },
    caseCount: 2,
    metrics: { 'reranked.recallAt5': 0.5 },
    perCategory: { answer: { 'reranked.recallAt5': 0.5 } },
    targets: { 'reranked.recallAt5': { target: 0.9, met: false } },
    passed: false,
    costUsd: 0.001,
    durationMs: 1200,
    triggeredBy: 'cli',
    startedAt: new Date('2026-10-10T09:00:00Z'),
    finishedAt: new Date('2026-10-10T09:00:02Z'),
    error: null,
    ...over,
  };
}

function result(
  runId: ObjectId,
  caseId: string,
  passed: boolean,
  category = 'answer',
): EvalResultDoc {
  return {
    _id: new ObjectId(),
    runId,
    caseId,
    category,
    tags: [],
    expected: { docSlugs: ['hr-annual-leave-us'] },
    actual: {
      decision: null,
      retrievedDocSlugs: passed ? ['hr-annual-leave-us'] : ['it-vpn'],
      citedDocSlugs: [],
      category: null,
      priority: null,
      fields: {},
      answerText: '',
    },
    scores: { 'reranked.recallAt5': passed ? 1 : 0 },
    passed,
    failureReasons: passed ? [] : ['RECALL_MISS'],
    traceRef: {},
    latencyMs: 300,
    costUsd: 0,
  };
}

describe('POST /api/admin/evals/runs', () => {
  it('queues a run, launches it with the filter and the admin’s Pro switch; audited', async () => {
    const ctl = controlledLauncher();
    const repository = memoryEvalsRepository();
    const ctx = buildTestApp({ evals: testEvals({ repository, launcher: ctl.launcher }) });
    const cookie = await loginCookie(ctx.app, ADMIN);
    const res = await request(ctx.app)
      .post(URL)
      .set('Cookie', cookie)
      .send({ suite: 'retrieval', tags: ['smoke'] });
    expect(res.status).toBe(202);
    expect(ctl.launches).toEqual([
      {
        runId: res.body.runId,
        suite: 'retrieval',
        tags: ['smoke'],
        caseIds: [],
        modelMode: 'local',
      },
    ]);
    expect(repository.runs[0]).toMatchObject({ status: 'queued', modelMode: 'local' });
    expect(ctx.audit.find((a) => a.action === 'eval.run')).toMatchObject({
      targetId: res.body.runId,
    });
  });

  it('409 while a run is active; a new run can start after it ends', async () => {
    const ctl = controlledLauncher();
    const repository = memoryEvalsRepository();
    const evals = testEvals({ repository, launcher: ctl.launcher });
    const ctx = buildTestApp({ evals });
    const cookie = await loginCookie(ctx.app, ADMIN);
    const first = await request(ctx.app)
      .post(URL)
      .set('Cookie', cookie)
      .send({ suite: 'retrieval' });
    expect(first.status).toBe(202);
    const second = await request(ctx.app).post(URL).set('Cookie', cookie).send({ suite: 'full' });
    expect(second.status).toBe(409);
    expect(second.body.error.details).toEqual({ runId: first.body.runId });

    // The runner finishes the run (as the CLI does), then exits.
    repository.runs[0]!.status = 'completed';
    ctl.finish();
    await evals.service.idle();
    expect(repository.runs[0]!.status).toBe('completed');
    expect(
      (await request(ctx.app).post(URL).set('Cookie', cookie).send({ suite: 'retrieval' })).status,
    ).toBe(202);
  });

  it('a runner that exits while the run is still active fails it with its last output', async () => {
    const ctl = controlledLauncher();
    const repository = memoryEvalsRepository();
    const evals = testEvals({ repository, launcher: ctl.launcher });
    const ctx = buildTestApp({ evals });
    const cookie = await loginCookie(ctx.app, ADMIN);
    await request(ctx.app).post(URL).set('Cookie', cookie).send({ suite: 'retrieval' });
    ctl.finish({ exitCode: 1, output: 'Retrieval eval…\nNo golden cases match the filters.\n' });
    await evals.service.idle();
    expect(repository.runs[0]).toMatchObject({
      status: 'failed',
      error: expect.stringContaining('No golden cases match the filters.'),
    });
  });

  it('400 for the judge suite (W4-06), unknown fields or bad case ids; 503 without a runner', async () => {
    const ctx = buildTestApp({ evals: testEvals({ launcher: controlledLauncher().launcher }) });
    const cookie = await loginCookie(ctx.app, ADMIN);
    const post = (body: object) => request(ctx.app).post(URL).set('Cookie', cookie).send(body);
    expect((await post({ suite: 'judge' })).status).toBe(400);
    expect((await post({ suite: 'retrieval', extra: 1 })).status).toBe(400);
    expect((await post({ suite: 'retrieval', caseIds: ['nope'] })).status).toBe(400);

    const none = buildTestApp();
    const admin = await loginCookie(none.app, ADMIN);
    expect(
      (await request(none.app).post(URL).set('Cookie', admin).send({ suite: 'retrieval' })).status,
    ).toBe(503);
  });
});

describe('GET runs, run, results', () => {
  it('lists runs newest first; detail has targets and the config snapshot; results filter', async () => {
    const older = completedRun({ startedAt: new Date('2026-10-01T09:00:00Z'), suite: 'full' });
    const newer = completedRun();
    const results = [
      result(newer._id, 'HR-ANS-001', true),
      result(newer._id, 'HR-ANS-002', false),
      result(newer._id, 'IT-PAR-001', false, 'partial'),
    ];
    const repository = memoryEvalsRepository([older, newer], results);
    const ctx = buildTestApp({ evals: testEvals({ repository }) });
    const cookie = await loginCookie(ctx.app, ADMIN);

    const list = await request(ctx.app).get(URL).set('Cookie', cookie);
    expect(list.status).toBe(200);
    expect(list.body.items.map((r: { id: string }) => r.id)).toEqual([
      newer._id.toHexString(),
      older._id.toHexString(),
    ]);
    expect(list.body.items[0]).toMatchObject({
      status: 'completed',
      passed: false,
      completedCases: 2,
      triggeredBy: 'cli',
      modelMode: null,
    });
    expect(
      (await request(ctx.app).get(`${URL}?suite=full`).set('Cookie', cookie)).body.items,
    ).toHaveLength(1);

    const detail = await request(ctx.app)
      .get(`${URL}/${newer._id.toHexString()}`)
      .set('Cookie', cookie);
    expect(detail.body.run).toMatchObject({
      targets: { 'reranked.recallAt5': { target: 0.9, met: false } },
      configSnapshot: { promptVersions: { rerank_assess: 1 }, gitCommit: 'abc1234' },
      perCategory: { answer: { 'reranked.recallAt5': 0.5 } },
    });

    const failed = await request(ctx.app)
      .get(`${URL}/${newer._id.toHexString()}/results?passed=false`)
      .set('Cookie', cookie);
    expect(failed.body.items.map((r: { caseId: string }) => r.caseId)).toEqual([
      'HR-ANS-002',
      'IT-PAR-001',
    ]);
    expect(failed.body.items[0]).toMatchObject({ failureReasons: ['RECALL_MISS'] });
    const partial = await request(ctx.app)
      .get(`${URL}/${newer._id.toHexString()}/results?category=partial&limit=1`)
      .set('Cookie', cookie);
    expect(partial.body.items.map((r: { caseId: string }) => r.caseId)).toEqual(['IT-PAR-001']);

    const missing = new ObjectId().toHexString();
    expect((await request(ctx.app).get(`${URL}/${missing}`).set('Cookie', cookie)).status).toBe(
      404,
    );
    expect(
      (await request(ctx.app).get(`${URL}/${missing}/results`).set('Cookie', cookie)).status,
    ).toBe(404);
  });

  it('admin only: 403 for agents and employees, 401 signed out', async () => {
    const ctx = buildTestApp({ evals: testEvals({ launcher: controlledLauncher().launcher }) });
    for (const email of ['sam.patel@example.com', 'priya.shah@example.com']) {
      const cookie = await loginCookie(ctx.app, email);
      expect((await request(ctx.app).get(URL).set('Cookie', cookie)).status).toBe(403);
      expect(
        (await request(ctx.app).post(URL).set('Cookie', cookie).send({ suite: 'retrieval' }))
          .status,
      ).toBe(403);
    }
    expect((await request(ctx.app).get(URL)).status).toBe(401);
  });
});

describe('startup clean-up of interrupted runs', () => {
  it('fails only runs whose launching API process on this host is gone', async () => {
    const queued = (owner?: { host: string; pid: number }) =>
      completedRun({ status: 'running', passed: null, ...(owner && { owner }) });
    const mine = queued({ host: 'pc1', pid: 100 }); // this host, process gone
    const otherLive = queued({ host: 'pc1', pid: 200 }); // e.g. the E2E API, still running
    const otherHost = queued({ host: 'pc2', pid: 100 });
    const legacy = queued(); // no owner recorded
    const repository = memoryEvalsRepository([mine, otherLive, otherHost, legacy]);
    const service = createEvalsService({
      repository,
      owner: { host: 'pc1', pid: 300 },
      isAlive: (pid) => pid === 200,
    });
    expect(await service.failInterrupted()).toBe(2);
    expect(repository.runs.map((r) => r.status)).toEqual([
      'failed',
      'running',
      'running',
      'failed',
    ]);
    expect(mine.error).toBe(INTERRUPTED_ERROR);
  });
});
