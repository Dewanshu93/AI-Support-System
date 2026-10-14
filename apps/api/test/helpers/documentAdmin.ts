// Admin document management for API tests (W4-04): the real ingestion pipeline
// over in-memory stores, fake embeddings and an in-memory file store.
import { createChunkEmbedder } from '../../src/ai/ingestion/embedder';
import { ingestSources } from '../../src/ai/ingestion/indexer';
import { loadSourceBody } from '../../src/ai/ingestion/loaders';
import { FakeEmbeddings } from '../../src/ai/llm/fakeModels';
import { createDocumentAdmin } from '../../src/modules/documents/admin';
import { createDocumentsService } from '../../src/modules/documents/service';
import { memoryDocumentStores } from './ingestion';

export function testDocumentAdmin(
  options: { pdfText?: (data: Uint8Array) => Promise<string> } = {},
) {
  const stores = memoryDocumentStores();
  const files = new Map<string, Uint8Array>();
  const documents = createDocumentsService({
    repo: stores.repo,
    vectors: stores.vectors,
    pollIntervalMs: 1,
  });
  const embedder = createChunkEmbedder(new FakeEmbeddings(768), {
    model: 'fake-embedding',
    dimension: 768,
    policy: { timeoutMs: 1000, maxRetries: 0 },
  });
  const admin = createDocumentAdmin({
    repo: stores.repo,
    documents,
    files: {
      read: async (p) => {
        const data = files.get(p);
        if (!data) throw new Error(`ENOENT ${p}`);
        return data;
      },
      write: async (p, data) => void files.set(p, data),
    },
    ingest: (sources, opts) => ingestSources(sources, { documents, embedder, force: opts?.force }),
    loadBody: (file, data) => loadSourceBody(file, data, options.pdfText ?? (async () => '')),
  });
  return { admin, stores, files, documents };
}
