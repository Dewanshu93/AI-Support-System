import { memoryDocumentStores } from '../../../test/helpers/ingestion';
import { createDocumentsService } from '../../modules/documents/service';
import { FakeEmbeddings } from '../llm/fakeModels';
import { loadCorpus } from './corpus';
import { createChunkEmbedder } from './embedder';
import { contentHash, documentId } from './identity';
import { ingestSources } from './indexer';
import {
  IngestError,
  loadCorpusSources,
  loadSourceBody,
  loadSourceFile,
  sourceFromCorpus,
} from './loaders';

const policy = { timeoutMs: 1000, maxRetries: 0 };

function setup() {
  const stores = memoryDocumentStores();
  const fake = new FakeEmbeddings(768);
  const documents = createDocumentsService({
    repo: stores.repo,
    vectors: stores.vectors,
    pollIntervalMs: 1,
    waitTimeoutMs: 50,
  });
  const embedder = createChunkEmbedder(fake, {
    model: 'gemini-embedding-001',
    dimension: 768,
    policy,
  });
  return { stores, fake, documents, embedder };
}

const corpus = loadCorpusSources();
const bySlug = (slug: string, version?: string) =>
  corpus.find((s) => s.meta.slug === slug && (!version || s.meta.version === version))!;

describe('ingestSources', () => {
  it('indexes the whole corpus, and a re-run skips every document', async () => {
    const { stores, fake, documents, embedder } = setup();
    const first = await ingestSources(corpus, { documents, embedder });
    expect(first.failed).toEqual([]);
    expect(first.indexed).toHaveLength(corpus.length);
    expect(first.stats.documents).toBe(39); // + hr-casual-leave (UC-11)
    expect(first.stats.chunks).toBeGreaterThan(35);
    expect(first.stats.maxTokens).toBeLessThanOrEqual(500);

    const embedCalls = fake.calls.length;
    const second = await ingestSources(corpus, { documents, embedder });
    expect(second.indexed).toEqual([]);
    expect(second.skipped).toHaveLength(corpus.length);
    expect(fake.calls.length).toBe(embedCalls);
    expect(second.stats).toEqual(first.stats);
    expect(stores.calls.replaceChunks).toBe(corpus.length);
  });

  it('stores chunk metadata that matches its document', async () => {
    const { stores, documents, embedder } = setup();
    await ingestSources([bySlug('hr-parental-leave-us', '3.0')], { documents, embedder });
    const id = documentId('hr-parental-leave-us', '3.0');
    const doc = stores.documents.get(id.toHexString())!;
    const chunks = stores.chunks.get(id.toHexString())!;
    expect(doc).toMatchObject({
      ingestStatus: 'indexed',
      chunkCount: chunks.length,
      ingestError: null,
    });
    for (const c of chunks) {
      expect(c).toMatchObject({
        documentId: id,
        docSlug: doc.slug,
        docTitle: doc.title,
        domain: doc.domain,
        countries: doc.countries,
        employmentTypes: doc.employmentTypes,
        accessLevel: doc.accessLevel,
        status: doc.status,
        effectiveDate: doc.effectiveDate,
        embeddingModel: 'gemini-embedding-001',
      });
      expect(
        c.contextualText.startsWith(`Parental Leave (US) > ${c.sectionPath.join(' > ')}\n`),
      ).toBe(true);
    }
    const points = stores.points.get(id.toHexString())!;
    expect(points.map((p) => p.chunk._id.toHexString())).toEqual(
      chunks.map((c) => c._id.toHexString()),
    );
    for (const p of points) {
      expect(p.dense).toHaveLength(768);
      expect(p.sparse.indices.length).toBeGreaterThan(0);
    }
  });

  it('marks the older version superseded in documents and both chunk stores', async () => {
    const { stores, documents, embedder } = setup();
    const result = await ingestSources(
      [bySlug('hr-parental-leave-us', '2.0'), bySlug('hr-parental-leave-us', '3.0')],
      { documents, embedder },
    );
    expect(result.superseded).toEqual(['hr-parental-leave-us@2.0']);
    const oldId = documentId('hr-parental-leave-us', '2.0').toHexString();
    const newId = documentId('hr-parental-leave-us', '3.0');
    expect(stores.documents.get(oldId)).toMatchObject({
      status: 'superseded',
      supersededBy: newId,
    });
    expect(stores.chunks.get(oldId)!.every((c) => c.status === 'superseded')).toBe(true);
    expect(stores.points.get(oldId)!.every((p) => p.chunk.status === 'superseded')).toBe(true);
    expect(stores.documents.get(newId.toHexString())).toMatchObject({
      status: 'active',
      supersededBy: null,
    });
  });

  it('re-indexes a document when its content changes, keeping createdAt', async () => {
    const { stores, documents, embedder } = setup();
    const source = bySlug('it-office-wifi');
    await ingestSources([source], { documents, embedder });
    const id = documentId(source.meta.slug, source.meta.version).toHexString();
    const createdAt = stores.documents.get(id)!.createdAt;

    const edited = {
      ...source,
      body: `${source.body}\n\n## New section\nGuest vouchers now last 48 hours.`,
    };
    const result = await ingestSources([edited], { documents, embedder });
    expect(result.indexed).toEqual(['it-office-wifi@1.3']);
    expect(stores.documents.get(id)!.createdAt).toEqual(createdAt);
    expect(stores.chunks.get(id)!.some((c) => c.sectionPath[0] === 'New section')).toBe(true);
  });

  it('re-indexes when a store lost the points even though the hash is unchanged', async () => {
    const { stores, documents, embedder } = setup();
    const source = bySlug('it-battery-safety');
    await ingestSources([source], { documents, embedder });
    stores.points.clear();
    const result = await ingestSources([source], { documents, embedder });
    expect(result.indexed).toEqual(['it-battery-safety@1.1']);
  });

  it('marks a document failed with the reason and continues with the others', async () => {
    const { stores, documents } = setup();
    let calls = 0;
    const flaky = {
      model: 'gemini-embedding-001',
      dimension: 768,
      embed: async (texts: string[]) => {
        if (++calls === 1) throw new Error('quota exceeded');
        return texts.map(() => new Array(768).fill(0.1));
      },
    };
    const result = await ingestSources([bySlug('it-office-wifi'), bySlug('it-battery-safety')], {
      documents,
      embedder: flaky,
    });
    expect(result.failed).toEqual([{ document: 'it-office-wifi@1.3', error: 'quota exceeded' }]);
    expect(result.indexed).toEqual(['it-battery-safety@1.1']);
    expect(stores.documents.get(documentId('it-office-wifi', '1.3').toHexString())).toBeUndefined();
  });

  it('marks a stored document failed when the vector index never catches up', async () => {
    const { stores } = setup();
    const documents = createDocumentsService({
      repo: stores.repo,
      vectors: { ...stores.vectors, countDocumentPoints: async () => 0 },
      pollIntervalMs: 1,
      waitTimeoutMs: 20,
    });
    const embedder = createChunkEmbedder(new FakeEmbeddings(768), {
      model: 'm',
      dimension: 768,
      policy,
    });
    const result = await ingestSources([bySlug('it-office-wifi')], { documents, embedder });
    expect(result.failed[0]!.error).toMatch(/vector index has 0 of \d+ points after 20 ms/);
    expect(stores.documents.get(documentId('it-office-wifi', '1.3').toHexString())).toMatchObject({
      ingestStatus: 'failed',
      ingestError: expect.stringMatching(/vector index/),
    });
  });
});

describe('identity and loaders', () => {
  it('gives each slug@version a stable, distinct document id', () => {
    expect(documentId('a', '1.0')).toEqual(documentId('a', '1.0'));
    expect(documentId('a', '1.0').equals(documentId('a', '2.0'))).toBe(false);
  });

  it('changes the content hash when metadata, body or embedding model change', () => {
    const s = bySlug('it-office-wifi');
    const emb = { model: 'gemini-embedding-001', dimension: 768 };
    const base = contentHash(s, emb);
    expect(contentHash({ ...s, body: `${s.body}  \r\n` }, emb)).toBe(base);
    expect(contentHash({ ...s, body: `${s.body}\nx` }, emb)).not.toBe(base);
    expect(contentHash({ ...s, meta: { ...s.meta, accessLevel: 'manager' } }, emb)).not.toBe(base);
    expect(contentHash(s, { ...emb, dimension: 1536 })).not.toBe(base);
  });

  it('corpus files: rejects PDF (uploads only) and other non-Markdown files', () => {
    expect(() => loadSourceFile('policy.pdf', '')).toThrow(
      new IngestError('policy.pdf: PDFs are added through the document upload (W4-04)'),
    );
    expect(() => loadSourceFile('policy.docx', '')).toThrow(/only Markdown/);
  });

  it('upload bodies: Markdown without frontmatter, PDF as its text, others rejected', async () => {
    const md = new TextEncoder().encode('---\ntitle: x\n---\n# Policy\n\nText.\n');
    expect(await loadSourceBody('p.md', md)).toEqual({
      body: '# Policy\n\nText.',
      sourceType: 'markdown',
    });
    const pdf = await loadSourceBody('p.pdf', new Uint8Array([1]), async () => ' Page text ');
    expect(pdf).toEqual({ body: 'Page text', sourceType: 'pdf' });
    await expect(
      loadSourceBody('p.pdf', new Uint8Array([1]), async () => {
        throw new Error('bad xref');
      }),
    ).rejects.toThrow('p.pdf: the PDF could not be read (bad xref)');
    await expect(loadSourceBody('p.docx', new Uint8Array())).rejects.toThrow(
      /Markdown \(\.md\) or PDF/,
    );
  });

  it('loads corpus sources with repo-relative paths', () => {
    const doc = loadCorpus().docs[0]!;
    expect(sourceFromCorpus(doc)).toMatchObject({
      sourceType: 'markdown',
      sourcePath: `corpus/${doc.file}`,
    });
  });
});
