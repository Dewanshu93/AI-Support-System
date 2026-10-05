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

export function createEmbeddings(
  config: ModelsConfig,
  keys: LlmKeys,
  purpose: EmbeddingPurpose,
): Embeddings {
  if (!keys.GEMINI_API_KEY) {
    throw new LlmError('config', 'GEMINI_API_KEY is not set; embeddings use Gemini (D-2)');
  }
  return new GoogleGenerativeAIEmbeddings({
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
