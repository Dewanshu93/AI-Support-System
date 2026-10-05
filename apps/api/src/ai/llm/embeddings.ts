// Embeddings factory (D-2: Gemini embeddings, configured separately from chat).
import type { Embeddings } from '@langchain/core/embeddings';
import { GoogleGenerativeAIEmbeddings } from '@langchain/google-genai';
import type { LlmKeys, ModelsConfig } from './keys';
import { LlmError } from './errors';
import { type CallPolicy, withCallPolicy } from './retry';

/** Documents and queries are embedded with different task types for better retrieval. */
export type EmbeddingPurpose = 'document' | 'query';

const TASK_TYPE = { document: 'RETRIEVAL_DOCUMENT', query: 'RETRIEVAL_QUERY' } as const;

export const EMBEDDING_BATCH_SIZE = 50;

interface GeminiBatchClient {
  batchEmbedContents(req: {
    requests: unknown[];
  }): Promise<{ embeddings: { values?: number[] }[] }>;
}

/**
 * LangChain's Gemini embeddings run batches with Promise.allSettled and turn a
 * failed batch (e.g. HTTP 429) into empty vectors, hiding the error. This
 * subclass sends batches one at a time and lets the error propagate, so the
 * call policy can retry it.
 */
export class StrictGeminiEmbeddings extends GoogleGenerativeAIEmbeddings {
  protected override async _embedDocumentsContent(documents: string[]): Promise<number[][]> {
    // `client` and `_convertToContent` are private in the type declarations only.
    const self = this as unknown as {
      client: GeminiBatchClient;
      _convertToContent(text: string): unknown;
    };
    const vectors: number[][] = [];
    for (let i = 0; i < documents.length; i += this.maxBatchSize) {
      const batch = documents.slice(i, i + this.maxBatchSize);
      const res = await self.client.batchEmbedContents({
        requests: batch.map((text) => self._convertToContent(text)),
      });
      vectors.push(...res.embeddings.map((v) => v.values ?? []));
    }
    return vectors;
  }
}

export function createEmbeddings(
  config: ModelsConfig,
  keys: LlmKeys,
  purpose: EmbeddingPurpose,
): Embeddings {
  if (!keys.GEMINI_API_KEY) {
    throw new LlmError('config', 'GEMINI_API_KEY is not set; embeddings use Gemini (D-2)');
  }
  return new StrictGeminiEmbeddings({
    model: config.embeddings.model,
    apiKey: keys.GEMINI_API_KEY,
    outputDimensionality: config.embeddings.dimension,
    taskType: TASK_TYPE[purpose] as never,
    maxRetries: 0,
  });
}

function checkDimensions(vectors: number[][], dimension: number): number[][] {
  for (const v of vectors) {
    if (v.length !== dimension) {
      throw new LlmError(
        'invalid_output',
        `Embedding has ${v.length} dimensions; config/models.yaml expects ${dimension}`,
      );
    }
  }
  return vectors;
}

/** Embeds texts in batches of 50 under the call policy; every vector's dimension is checked. */
export async function embedDocuments(
  embeddings: Embeddings,
  texts: string[],
  options: { policy: CallPolicy; dimension: number; batchSize?: number },
): Promise<{ vectors: number[][]; retries: number }> {
  const size = options.batchSize ?? EMBEDDING_BATCH_SIZE;
  const vectors: number[][] = [];
  let retries = 0;
  for (let i = 0; i < texts.length; i += size) {
    const batch = texts.slice(i, i + size);
    const { value, retries: r } = await withCallPolicy(
      () => embeddings.embedDocuments(batch),
      options.policy,
    );
    retries += r;
    if (value.length !== batch.length) {
      throw new LlmError(
        'invalid_output',
        `Expected ${batch.length} embeddings, got ${value.length}`,
      );
    }
    vectors.push(...checkDimensions(value, options.dimension));
  }
  return { vectors, retries };
}

export async function embedQuery(
  embeddings: Embeddings,
  text: string,
  options: { policy: CallPolicy; dimension: number },
): Promise<number[]> {
  const { value } = await withCallPolicy(() => embeddings.embedQuery(text), options.policy);
  return checkDimensions([value], options.dimension)[0]!;
}
