// Full-graph suite (playbook section 8; W2-10): every golden case runs through the
// compiled runtime graph (real retrieval, storage and LLM; in-memory checkpointer)
// as its seeded user, in an isolated eval conversation (isEval). Multi-turn cases
// send each planned user turn; the last turn is scored. Concurrency 4. The eval
// never confirms: a turn that proposes a write stops at awaitConfirmation.
import { ObjectId } from 'mongodb';
import { threadConfig } from '../../apps/api/src/ai/graph/checkpointer';
import type { SupportGraph } from '../../apps/api/src/ai/graph/graph';
import { newTurn, type State } from '../../apps/api/src/ai/graph/state';
import { workspaceIntentOf } from '../../apps/api/src/ai/schemas';
import type { MessageDoc, UserDoc } from '../../apps/api/src/db/schemas';
import type { ConversationsRepository } from '../../apps/api/src/modules/conversations/repository';
import { type FullCaseOutcome, WRITE_NODES } from './fullScorers';
import type { GoldenCase } from './schema';

export interface FullSuiteDeps {
  graph: SupportGraph;
  conversations: Pick<ConversationsRepository, 'insertConversation' | 'insertMessage'>;
  userFor(email: string): UserDoc | undefined;
  concurrency?: number;
  now?: () => Date;
  log?(line: string): void;
  /** Called after each case with the number of cases finished (progress, W4-05). */
  onCaseDone?(completed: number): void | Promise<void>;
}

const userMessage = (conversationId: ObjectId, content: string, at: Date): MessageDoc => ({
  _id: new ObjectId(),
  conversationId,
  role: 'user',
  content,
  decision: null,
  reasonCode: null,
  citations: [],
  uncovered: [],
  ticketDraft: null,
  status: 'complete',
  isEval: true,
  createdAt: at,
});

async function runCase(c: GoldenCase, deps: FullSuiteDeps): Promise<FullCaseOutcome> {
  const now = deps.now ?? (() => new Date());
  const base: FullCaseOutcome = {
    caseId: c.id,
    category: c.category,
    tags: c.tags,
    expected: c.expected,
    decision: null,
    reasonCode: null,
    contextDocs: [],
    citedDocs: [],
    answerText: '',
    withdrawn: false,
    citationsShown: 0,
    citationsShownValid: 0,
    citationsProposed: 0,
    citationsProposedValid: 0,
    latencyMs: 0,
    ttftMs: null,
    costUsd: 0,
    flags: [],
    error: null,
    workspaceIntent: null,
    awaiting: null,
    writeNodes: [],
  };
  const writeNodes: string[] = [];
  const user = deps.userFor(c.userEmail);
  if (!user) return { ...base, error: `unknown user ${c.userEmail}` };

  const conversationId = new ObjectId();
  try {
    const at = now();
    await deps.conversations.insertConversation({
      _id: conversationId,
      userId: user._id,
      title: '',
      status: 'open',
      resolution: null,
      ticketId: null,
      restricted: false,
      lastDecision: null,
      turnCount: 0,
      isEval: true,
      createdAt: at,
      updatedAt: at,
    });
    let state: State | undefined;
    let costUsd = 0;
    for (const turn of c.turns) {
      const message = userMessage(conversationId, turn.content, now());
      await deps.conversations.insertMessage(message);
      state = (await deps.graph.invoke(
        newTurn({
          conversationId: conversationId.toHexString(),
          userId: user._id.toHexString(),
          userMessageId: message._id.toHexString(),
          assistantMessageId: new ObjectId().toHexString(),
          text: turn.content,
          forceEscalate: false,
        }),
        threadConfig(conversationId.toHexString()),
      )) as State;
      costUsd += state.trace.llmCalls.reduce((n, l) => n + l.costUsd, 0);
      for (const step of state.trace.steps) {
        if ((WRITE_NODES as readonly string[]).includes(step.node)) writeNodes.push(step.node);
      }
    }
    const s = state!;
    const out = s.output;
    const context = s.retrieval?.context ?? [];
    const contextIds = new Set(context.map((x) => x.chunkId));
    const bySlug = new Map(context.map((x) => [x.chunkId, x.docSlug]));
    const citations = s.output?.citations ?? [];
    const logged = s.trace.outputs.citations as
      { citationsProposed: string[]; citationsRejected: string[] } | undefined;
    return {
      ...base,
      decision: s.decision?.value ?? null,
      reasonCode: s.decision?.reasonCode ?? null,
      contextDocs: context.map((x) => ({ slug: x.docSlug, documentId: x.documentId })),
      citedDocs: citations.map((x) => ({
        slug: bySlug.get(x.chunkId) ?? '',
        documentId: x.documentId,
      })),
      answerText: s.output?.text ?? '',
      withdrawn: s.output?.withdrawn ?? false,
      citationsShown: citations.length,
      citationsShownValid: citations.filter((x) => contextIds.has(x.chunkId)).length,
      citationsProposed: logged?.citationsProposed.length ?? 0,
      citationsProposedValid:
        (logged?.citationsProposed.length ?? 0) - (logged?.citationsRejected.length ?? 0),
      latencyMs: Object.values(s.trace.stepLatencyMs).reduce((a, b) => a + b, 0),
      ttftMs: s.trace.llmCalls.find((l) => l.node === 'answer')?.ttftMs ?? null,
      costUsd,
      flags: s.trace.flags,
      workspaceIntent: s.analysis ? workspaceIntentOf(s.analysis) : null,
      awaiting:
        out?.action && !out.actionResult ? 'action' : out?.draft && !out.ticketId ? 'draft' : null,
      writeNodes,
      ticket: out?.draft
        ? {
            category: out.draft.category,
            subcategory: out.draft.subcategory,
            priority: out.draft.priority,
            fields: out.draft.fields,
          }
        : null,
    };
  } catch (err) {
    return { ...base, writeNodes, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function runFullSuite(
  cases: GoldenCase[],
  deps: FullSuiteDeps,
): Promise<FullCaseOutcome[]> {
  const results: FullCaseOutcome[] = new Array(cases.length);
  let next = 0;
  let done = 0;
  const worker = async () => {
    while (next < cases.length) {
      const i = next++;
      const outcome = await runCase(cases[i]!, deps);
      results[i] = outcome;
      deps.log?.(
        `${outcome.caseId} ${outcome.error ? `ERROR ${outcome.error.slice(0, 120)}` : `${outcome.decision}/${outcome.reasonCode}`} (expected ${outcome.expected.decision})`,
      );
      await deps.onCaseDone?.(++done);
    }
  };
  await Promise.all(Array.from({ length: Math.min(deps.concurrency ?? 4, cases.length) }, worker));
  return results;
}
