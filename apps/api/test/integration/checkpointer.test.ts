// MongoDB checkpointer against a real server (skipped unless MONGODB_TEST_URI is
// set). Uses a throwaway database, dropped afterwards.
import { randomBytes } from 'node:crypto';
import { Command } from '@langchain/langgraph';
import {
  CHECKPOINT_COLLECTIONS,
  createMongoCheckpointer,
  threadConfig,
} from '../../src/ai/graph/checkpointer';
import { buildSupportGraph } from '../../src/ai/graph/graph';
import { newTurn, type State } from '../../src/ai/graph/state';
import { connectDatabase, type Database } from '../../src/db';

const mongoUri = process.env.MONGODB_TEST_URI;
jest.setTimeout(120_000);

(mongoUri ? describe : describe.skip)('MongoDB checkpointer (integration)', () => {
  let database: Database;
  const dbName = `servicedesk_test_${randomBytes(4).toString('hex')}`;

  beforeAll(async () => {
    database = await connectDatabase(mongoUri!, { dbName, appName: 'checkpointer-test' });
  });
  afterAll(async () => {
    await database?.db.dropDatabase();
    await database?.client.close();
  });

  it('a draft paused by interrupt() resumes from MongoDB in a fresh graph instance', async () => {
    const id = 'conv-checkpoint-1';
    const first = buildSupportGraph({
      checkpointer: createMongoCheckpointer(database.client, dbName),
    });
    await first.invoke(
      newTurn({
        conversationId: id,
        userId: 'u',
        userMessageId: 'm1',
        assistantMessageId: 'm2',
        text: 'Please get me a person',
        forceEscalate: true,
      }),
      threadConfig(id),
    );
    expect((await first.getState(threadConfig(id))).next).toEqual(['awaitConfirmation']);
    expect(
      await database.db.collection(CHECKPOINT_COLLECTIONS.checkpoints).countDocuments(),
    ).toBeGreaterThan(0);

    // Simulates an API restart between the chat turn and the confirm request.
    const second = buildSupportGraph({
      checkpointer: createMongoCheckpointer(database.client, dbName),
    });
    const state = (await second.invoke(
      new Command({ resume: { action: 'confirm' } }),
      threadConfig(id),
    )) as State;
    expect(state.output?.ticketId).toBe('stub-ticket');
    expect(state.trace.steps.map((s) => s.node).slice(-2)).toEqual([
      'createTicket',
      'agentSummary',
    ]);
    expect((await second.getState(threadConfig(id))).next).toEqual([]);
  });
});
