// W4-04: admin documents — upload (.md/.pdf ≤ 5 MB + metadata) through the real
// ingestion pipeline (in-memory stores, fake embeddings), supersede, re-index,
// status; rejection cases; admin only; writes audited.
import request from 'supertest';
import { documentId } from '../../src/ai/ingestion/identity';
import { buildTestApp, loginCookie } from '../helpers/app';
import { testDocumentAdmin } from '../helpers/documentAdmin';

const URL = '/api/admin/documents';
const ADMIN = 'alex.morgan@example.com';

const META = {
  slug: 'it-home-office-equipment',
  title: 'Home Office Equipment',
  domain: 'IT',
  owner: 'IT Service Desk',
  version: '1.0',
  effectiveDate: '2026-10-01',
  countries: ['UK'],
  employmentTypes: ['full_time'],
  accessLevel: 'standard',
};
const BODY = [
  '# Home Office Equipment',
  '',
  '## Monitors',
  '',
  'Full-time employees in the UK may order one external monitor for home use.',
  '',
  '## Returns',
  '',
  'Equipment is returned to the office when employment ends.',
].join('\n');

function setup(options: Parameters<typeof testDocumentAdmin>[0] = {}) {
  const docs = testDocumentAdmin(options);
  const ctx = buildTestApp({ documentAdmin: docs.admin });
  return { ctx, ...docs };
}

async function upload(
  ctx: ReturnType<typeof setup>['ctx'],
  cookie: string,
  { meta = META as object, file = BODY, name = 'equipment.md' } = {},
) {
  return request(ctx.app)
    .post(URL)
    .set('Cookie', cookie)
    .field('metadata', JSON.stringify(meta))
    .attach('file', Buffer.from(file), name);
}

describe('POST /api/admin/documents (upload)', () => {
  it('indexes a Markdown policy with its audience on every chunk; listed and audited', async () => {
    const { ctx, stores, files } = setup();
    const cookie = await loginCookie(ctx.app, ADMIN);
    const res = await upload(ctx, cookie);
    expect(res.status).toBe(201);
    expect(res.body.document).toMatchObject({
      slug: META.slug,
      version: '1.0',
      status: 'active',
      ingestStatus: 'indexed',
      sourceType: 'markdown',
      countries: ['UK'],
      employmentTypes: ['full_time'],
      effectiveDate: '2026-10-01',
    });
    expect(res.body.document.chunkCount).toBeGreaterThan(0);

    const id = documentId(META.slug, '1.0');
    const chunks = stores.chunks.get(id.toHexString())!;
    expect(chunks.length).toBe(res.body.document.chunkCount);
    for (const c of chunks) {
      expect(c).toMatchObject({
        countries: ['UK'],
        employmentTypes: ['full_time'],
        accessLevel: 'standard',
        status: 'active',
      });
    }
    // The same chunks are in the vector store, and the original file is kept for re-indexing.
    expect(stores.points.get(id.toHexString())).toHaveLength(chunks.length);
    expect(files.has('data/uploads/it-home-office-equipment@1.0.md')).toBe(true);

    expect(ctx.audit.find((a) => a.action === 'document.upload')).toMatchObject({
      targetId: id.toHexString(),
    });
    const list = await request(ctx.app).get(`${URL}?country=UK`).set('Cookie', cookie);
    expect(list.body.items.map((d: { slug: string }) => d.slug)).toEqual([META.slug]);
    expect(
      (await request(ctx.app).get(`${URL}?country=US`).set('Cookie', cookie)).body.items,
    ).toEqual([]);

    const detail = await request(ctx.app).get(`${URL}/${id.toHexString()}`).set('Cookie', cookie);
    expect(detail.status).toBe(200);
    expect(detail.body.chunks[0]).toMatchObject({ ordinal: 0, preview: expect.any(String) });
  });

  it('a PDF is indexed from its text', async () => {
    const { ctx } = setup({ pdfText: async () => BODY });
    const cookie = await loginCookie(ctx.app, ADMIN);
    const res = await upload(ctx, cookie, { name: 'equipment.pdf', file: '%PDF-1.7 fake' });
    expect(res.status).toBe(201);
    expect(res.body.document).toMatchObject({ sourceType: 'pdf', ingestStatus: 'indexed' });
  });

  it('a new version that supersedes the old one hides it in both stores', async () => {
    const { ctx, stores } = setup();
    const cookie = await loginCookie(ctx.app, ADMIN);
    await upload(ctx, cookie);
    const v2 = await upload(ctx, cookie, { meta: { ...META, version: '2.0', supersedes: '1.0' } });
    expect(v2.status).toBe(201);
    const oldId = documentId(META.slug, '1.0');
    const old = (await request(ctx.app).get(`${URL}/${oldId.toHexString()}`).set('Cookie', cookie))
      .body.document;
    expect(old).toMatchObject({ status: 'superseded', supersededBy: v2.body.document.id });
    expect(stores.chunks.get(oldId.toHexString())!.every((c) => c.status === 'superseded')).toBe(
      true,
    );
    expect(
      stores.points.get(oldId.toHexString())!.every((p) => p.chunk.status === 'superseded'),
    ).toBe(true);
  });

  describe('rejections', () => {
    it('400: no file, wrong type, too large, empty', async () => {
      const { ctx } = setup();
      const cookie = await loginCookie(ctx.app, ADMIN);
      const noFile = await request(ctx.app)
        .post(URL)
        .set('Cookie', cookie)
        .field('metadata', JSON.stringify(META));
      expect(noFile.status).toBe(400);
      expect((await upload(ctx, cookie, { name: 'policy.docx' })).status).toBe(400);
      const big = await upload(ctx, cookie, { file: 'x'.repeat(5 * 1024 * 1024 + 1) });
      expect(big.status).toBe(400);
      expect(big.body.error.message).toMatch(/larger than 5 MB/);
      expect((await upload(ctx, cookie, { file: '---\na: 1\n---\n' })).status).toBe(400);
    });

    it('400: metadata missing, not JSON, or invalid (with the failing fields)', async () => {
      const { ctx } = setup();
      const cookie = await loginCookie(ctx.app, ADMIN);
      const missing = await request(ctx.app)
        .post(URL)
        .set('Cookie', cookie)
        .attach('file', Buffer.from(BODY), 'a.md');
      expect(missing.status).toBe(400);
      const notJson = await request(ctx.app)
        .post(URL)
        .set('Cookie', cookie)
        .field('metadata', '{oops')
        .attach('file', Buffer.from(BODY), 'a.md');
      expect(notJson.status).toBe(400);
      const bad = await upload(ctx, cookie, {
        meta: { ...META, slug: 'Not Kebab', countries: ['FR'], title: '' },
      });
      expect(bad.status).toBe(400);
      const paths = bad.body.error.details.issues.map((i: { path: string }) => i.path);
      expect(paths).toEqual(expect.arrayContaining(['slug', 'title']));
      expect(paths.some((p: string) => p.startsWith('countries'))).toBe(true);
    });

    it('409 for an existing slug+version or a second active version; 400 for a bad supersede', async () => {
      const { ctx } = setup();
      const cookie = await loginCookie(ctx.app, ADMIN);
      await upload(ctx, cookie);
      expect((await upload(ctx, cookie)).status).toBe(409);
      expect((await upload(ctx, cookie, { meta: { ...META, version: '2.0' } })).status).toBe(409);
      expect(
        (await upload(ctx, cookie, { meta: { ...META, version: '2.0', supersedes: '0.5' } }))
          .status,
      ).toBe(400);
      expect(
        (await upload(ctx, cookie, { meta: { ...META, version: '0.9', supersedes: '1.0' } }))
          .status,
      ).toBe(400);
    });
  });
});

describe('upload content checks (W4-07)', () => {
  it('400: a PDF without the %PDF- header, non-UTF-8 Markdown, or a mismatched MIME type', async () => {
    const { ctx } = setup({ pdfText: async () => BODY });
    const cookie = await loginCookie(ctx.app, ADMIN);
    const post = (file: Buffer, name: string, contentType?: string) =>
      request(ctx.app)
        .post(URL)
        .set('Cookie', cookie)
        .field('metadata', JSON.stringify(META))
        .attach('file', file, contentType ? { filename: name, contentType } : name);
    const notPdf = await post(Buffer.from('<html>not a pdf</html>'), 'policy.pdf');
    expect(notPdf.status).toBe(400);
    expect(notPdf.body.error.message).toBe('The file is not a valid PDF');
    const latin1 = await post(Buffer.from([0x23, 0x20, 0xe9, 0x74, 0xe9]), 'policy.md');
    expect(latin1.body.error.message).toBe('Markdown files must be UTF-8 text');
    const image = await post(Buffer.from(BODY), 'policy.md', 'image/png');
    expect(image.status).toBe(400);
    expect(image.body.error.message).toContain('cannot have the type image/png');
  });
});

describe('POST /api/admin/documents/:id/reindex', () => {
  it('recreates the chunks from the stored source; 404 unknown; audited', async () => {
    const { ctx, stores } = setup();
    const cookie = await loginCookie(ctx.app, ADMIN);
    const created = await upload(ctx, cookie);
    const before = stores.calls.replaceChunks;
    const res = await request(ctx.app)
      .post(`${URL}/${created.body.document.id}/reindex`)
      .set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.body.document.ingestStatus).toBe('indexed');
    expect(stores.calls.replaceChunks).toBe(before + 1);
    expect(ctx.audit.some((a) => a.action === 'document.reindex')).toBe(true);
    const unknown = documentId('nope', '1').toHexString();
    expect(
      (await request(ctx.app).post(`${URL}/${unknown}/reindex`).set('Cookie', cookie)).status,
    ).toBe(404);
  });

  it('409 when the source file is missing', async () => {
    const { ctx, files } = setup();
    const cookie = await loginCookie(ctx.app, ADMIN);
    const created = await upload(ctx, cookie);
    files.clear();
    const res = await request(ctx.app)
      .post(`${URL}/${created.body.document.id}/reindex`)
      .set('Cookie', cookie);
    expect(res.status).toBe(409);
  });
});

describe('PATCH /api/admin/documents/:id/status', () => {
  it('deactivating hides the chunks; reactivating while another version is active is 409', async () => {
    const { ctx, stores } = setup();
    const cookie = await loginCookie(ctx.app, ADMIN);
    const v1 = await upload(ctx, cookie);
    const id = v1.body.document.id as string;
    const off = await request(ctx.app)
      .patch(`${URL}/${id}/status`)
      .set('Cookie', cookie)
      .send({ status: 'inactive' });
    expect(off.status).toBe(200);
    expect(off.body.document.status).toBe('inactive');
    expect(stores.chunks.get(id)!.every((c) => c.status === 'inactive')).toBe(true);
    expect(stores.points.get(id)!.every((p) => p.chunk.status === 'inactive')).toBe(true);
    expect(ctx.audit.find((a) => a.action === 'document.status_change')?.metadata).toEqual({
      from: 'active',
      to: 'inactive',
    });

    // v2 can now be the active version; turning v1 back on would make two.
    expect((await upload(ctx, cookie, { meta: { ...META, version: '2.0' } })).status).toBe(201);
    const again = await request(ctx.app)
      .patch(`${URL}/${id}/status`)
      .set('Cookie', cookie)
      .send({ status: 'active' });
    expect(again.status).toBe(409);
    expect(
      (
        await request(ctx.app)
          .patch(`${URL}/${id}/status`)
          .set('Cookie', cookie)
          .send({ status: 'deleted' })
      ).status,
    ).toBe(400);
  });
});

describe('access', () => {
  it('admin only: 403 for agents and employees, 401 signed out', async () => {
    const { ctx } = setup();
    for (const email of ['sam.patel@example.com', 'priya.shah@example.com']) {
      const cookie = await loginCookie(ctx.app, email);
      expect((await request(ctx.app).get(URL).set('Cookie', cookie)).status).toBe(403);
      expect((await upload(ctx, cookie)).status).toBe(403);
    }
    expect((await request(ctx.app).get(URL)).status).toBe(401);
  });
});
