// Step 6: embed contextualised chunk text (batches of 50, retries with backoff).
import type { Embeddings } from '@langchain/core/embeddings';
import { type CallPolicy, embedDocuments } from '../llm';

export interface ChunkEmbedder {
  model: string;
  dimension: number;
  embed(texts: string[]): Promise<number[][]>;
}

export function createChunkEmbedder(
  embeddings: Embeddings,
  options: { model: string; dimension: number; policy: CallPolicy },
): ChunkEmbedder {
  return {
    model: options.model,
    dimension: options.dimension,
    async embed(texts) {
      const { vectors } = await embedDocuments(embeddings, texts, {
        policy: options.policy,
        dimension: options.dimension,
      });
      return vectors;
    },
  };
}
