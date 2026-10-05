// Checkpointers (ADR-007). MongoDB in the running app (thread_id =
// conversationId); in-memory for tests and eval runs. The checkpoint
// collections are owned by the package and never touched by app code.
import { type BaseCheckpointSaver, MemorySaver } from '@langchain/langgraph';
import { MongoDBSaver } from '@langchain/langgraph-checkpoint-mongodb';
import type { MongoClient } from 'mongodb';

export const CHECKPOINT_COLLECTIONS = {
  checkpoints: 'graph_checkpoints',
  writes: 'graph_checkpoint_writes',
} as const;

export function createMongoCheckpointer(client: MongoClient, dbName: string): BaseCheckpointSaver {
  return new MongoDBSaver({
    // The package is typed against mongodb 6; it only calls client.db() and
    // standard collection methods, which the v7 client provides (ADR-007).
    client: client as unknown as ConstructorParameters<typeof MongoDBSaver>[0]['client'],
    dbName,
    checkpointCollectionName: CHECKPOINT_COLLECTIONS.checkpoints,
    checkpointWritesCollectionName: CHECKPOINT_COLLECTIONS.writes,
  });
}

export function createMemoryCheckpointer(): BaseCheckpointSaver {
  return new MemorySaver();
}

/** Config for invoke/stream: one checkpoint thread per conversation. */
export function threadConfig(conversationId: string) {
  return { configurable: { thread_id: conversationId } };
}
