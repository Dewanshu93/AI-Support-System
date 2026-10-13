// W4-02: knowledge gaps — admin only; a refresh clusters the gap turns (fake
// embeddings and labeller), excludes restricted and evaluation turns, and
// replaces the snapshot; 409 while one runs, 503 without models.
import { ObjectId } from 'mongodb';
import request from 'supertest';
import type { GapLabelFn } from '../../src/ai/nodes/gapLabel';
import { buildTestApp, loginCookie } from '../helpers/app';
import { memoryGapsRepository, type TestCandidate, testGaps } from '../helpers/gaps';

const URL = '/api/admin/knowledge-gaps';
const ADMIN = 'alex.morgan@example.com';
const TODAY = new Date('2026-10-13T12:00:00Z');

// Two topics on orthogonal axes; the text says which axis the fake embedder uses.
const AXES: Record<string, number[]> = {
  parental: [1, 0, 0],
  vpn: [0, 1, 0],
  secret: [0, 0, 1],
};

function candidate(text: string, extra: Partial<TestCandidate> = {}): TestCandidate {
  return {
    messageId: new ObjectId().toHexString(),
    conversationId: new ObjectId().toHexString(),
    text,
    decision: 'PARTIAL',
    reasonCode: 'EVIDENCE_PARTIAL',
    restricted: false,
    isEval: false,
    createdAt: new Date('2026-10-10T09:00:00Z'),
    ...extra,
  };
}

const CANDIDATES: TestCandidate[] = [
  candidate('parental leave for contractors?'),
  candidate('do contractors get parental leave', {
    decision: 'ESCALATE',
    reasonCode: 'NO_EVIDENCE',
  }),
  candidate('vpn on a personal phone?'),
  candidate('can I use the vpn on my own tablet'),
  // Never part of a gap: confidential, evaluation, out of range.
  candidate('secret matter one', { restricted: true }),
  candidate('secret matter two', { restricted: true }),
  candidate('parental leave eval case', { isEval: true }),
  candidate('vpn last year', { createdAt: new Date('2025-01-01T00:00:00Z') }),
];

function fakeEmbed(texts: string[]): Promise<number[][]> {
  return Promise.resolve(
    texts.map((t) => AXES[Object.keys(AXES).find((k) => t.includes(k)) ?? 'secret']!),
  );
}

const fakeLabel: GapLabelFn = async (questions) =>
  questions[0]!.includes('vpn')
    ? { label: 'VPN on personal devices', domain: 'IT', labelled: true }
    : { label: 'Parental leave for contractors', domain: 'HR', labelled: true };

function setup(options: { embed?: boolean; label?: GapLabelFn } = {}) {
  const repository = memoryGapsRepository(CANDIDATES);
  const embedded: string[][] = [];
  const gaps = testGaps({
    repository,
    now: () => TODAY,
    embed:
      options.embed === false
        ? undefined
        : (texts) => {
            embedded.push(texts);
            return fakeEmbed(texts);
          },
    label: options.label ?? fakeLabel,
  });
  const ctx = buildTestApp({ clock: () => TODAY, gaps });
  return { ctx, gaps, repository, embedded };
}

describe('GET /api/admin/knowledge-gaps', () => {
  it('no snapshot yet: null with an idle refresh state', async () => {
    const { ctx } = setup();
    const cookie = await loginCookie(ctx.app, ADMIN);
    const res = await request(ctx.app).get(`${URL}?snapshot=latest`).set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      snapshot: null,
      refresh: { status: 'idle', startedAt: null, error: null },
    });
  });

  it('only admins: 403 for agents and employees, 401 signed out', async () => {
    const { ctx } = setup();
    for (const email of ['sam.patel@example.com', 'priya.shah@example.com']) {
      const cookie = await loginCookie(ctx.app, email);
      expect((await request(ctx.app).get(URL).set('Cookie', cookie)).status).toBe(403);
      expect(
        (await request(ctx.app).post(`${URL}/refresh`).set('Cookie', cookie).send({})).status,
      ).toBe(403);
    }
    expect((await request(ctx.app).get(URL)).status).toBe(401);
  });
});

describe('POST /api/admin/knowledge-gaps/refresh', () => {
  it('clusters gap questions into labelled clusters, largest first, with trace links', async () => {
    const { ctx, gaps, embedded } = setup();
    const cookie = await loginCookie(ctx.app, ADMIN);
    const started = await request(ctx.app).post(`${URL}/refresh`).set('Cookie', cookie).send({});
    expect(started.status).toBe(202);
    expect(started.body.refresh.status).toBe('running');
    await gaps.service.idle();

    const res = await request(ctx.app).get(URL).set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.refresh.status).toBe('idle');
    expect(res.body.snapshot.range).toEqual({ from: '2026-09-14', to: '2026-10-13' });
    const clusters = res.body.snapshot.clusters as {
      label: string;
      domain: string;
      questionCount: number;
      examples: { question: string; conversationId: string }[];
    }[];
    expect(clusters.map((c) => [c.label, c.domain, c.questionCount])).toEqual([
      ['Parental leave for contractors', 'HR', 2],
      ['VPN on personal devices', 'IT', 2],
    ]);
    const vpn = CANDIDATES[2]!;
    expect(clusters[1]!.examples[0]).toEqual({
      question: vpn.text,
      messageId: vpn.messageId,
      conversationId: vpn.conversationId,
    });
    // Restricted, evaluation and out-of-range turns are never embedded or shown.
    const sent = embedded.flat();
    expect(sent).toHaveLength(4);
    expect(
      sent.some((t) => t.includes('secret') || t.includes('eval') || t.includes('last year')),
    ).toBe(false);
    expect(JSON.stringify(res.body)).not.toContain('secret');

    expect(ctx.audit.find((a) => a.action === 'admin.gaps_refresh')?.metadata).toEqual({
      from: '2026-09-14',
      to: '2026-10-13',
    });
  });

  it('a failed label keeps the cluster as "Unlabelled cluster"', async () => {
    const { ctx, gaps } = setup({
      label: async () => ({ label: 'Unlabelled cluster', domain: 'unknown', labelled: false }),
    });
    const cookie = await loginCookie(ctx.app, ADMIN);
    await request(ctx.app).post(`${URL}/refresh`).set('Cookie', cookie).send({});
    await gaps.service.idle();
    const res = await request(ctx.app).get(URL).set('Cookie', cookie);
    expect(res.body.snapshot.clusters[0]).toMatchObject({
      label: 'Unlabelled cluster',
      labelled: false,
      domain: 'unknown',
    });
  });

  it('a range with no gap turns clears the snapshot', async () => {
    const { ctx, gaps, repository } = setup();
    const cookie = await loginCookie(ctx.app, ADMIN);
    await request(ctx.app).post(`${URL}/refresh`).set('Cookie', cookie).send({});
    await gaps.service.idle();
    expect(repository.stored).toHaveLength(2);
    await request(ctx.app)
      .post(`${URL}/refresh`)
      .set('Cookie', cookie)
      .send({ from: '2026-01-01', to: '2026-01-31' });
    await gaps.service.idle();
    expect((await request(ctx.app).get(URL).set('Cookie', cookie)).body.snapshot).toBeNull();
  });

  it('409 while a refresh runs; 400 for a reversed range or unknown fields', async () => {
    // The embedder waits until released, so the first refresh is still running.
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    const gaps = testGaps({
      repository: memoryGapsRepository(CANDIDATES),
      now: () => TODAY,
      embed: async (texts) => {
        await gate;
        return fakeEmbed(texts);
      },
      label: fakeLabel,
    });
    const ctx = buildTestApp({ clock: () => TODAY, gaps });
    const cookie = await loginCookie(ctx.app, ADMIN);
    await request(ctx.app).post(`${URL}/refresh`).set('Cookie', cookie).send({});
    const again = await request(ctx.app).post(`${URL}/refresh`).set('Cookie', cookie).send({});
    expect(again.status).toBe(409);
    release();
    await gaps.service.idle();
    expect(
      (
        await request(ctx.app)
          .post(`${URL}/refresh`)
          .set('Cookie', cookie)
          .send({ from: '2026-10-13', to: '2026-10-01' })
      ).status,
    ).toBe(400);
    expect(
      (await request(ctx.app).post(`${URL}/refresh`).set('Cookie', cookie).send({ all: true }))
        .status,
    ).toBe(400);
  });

  it('503 when embeddings are not configured; embedding failure is reported as failed', async () => {
    const off = setup({ embed: false });
    const cookie = await loginCookie(off.ctx.app, ADMIN);
    expect(
      (await request(off.ctx.app).post(`${URL}/refresh`).set('Cookie', cookie).send({})).status,
    ).toBe(503);

    const repository = memoryGapsRepository(CANDIDATES);
    const gaps = testGaps({
      repository,
      now: () => TODAY,
      embed: () => Promise.reject(new Error('quota')),
      label: fakeLabel,
    });
    const ctx = buildTestApp({ clock: () => TODAY, gaps });
    const admin = await loginCookie(ctx.app, ADMIN);
    await request(ctx.app).post(`${URL}/refresh`).set('Cookie', admin).send({});
    await gaps.service.idle();
    const res = await request(ctx.app).get(URL).set('Cookie', admin);
    expect(res.body.refresh.status).toBe('failed');
    expect(res.body.refresh.error).toMatch(/failed/);
    expect(res.body.snapshot).toBeNull();
  });
});
