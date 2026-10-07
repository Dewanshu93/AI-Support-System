// Runs one employee turn through supportTurnGraph and emits the SSE events
// (playbook sections 4 and 5). One running turn per conversation (409); a
// conversation whose ticket draft awaits confirmation takes no new turns (409).
// If the client disconnects, the graph still completes and persists.
import type { AuthUser, ChatEvent, TicketDraft, TimesheetAction } from '@sd/shared';
import { ObjectId } from 'mongodb';
import { threadConfig } from '../../ai/graph/checkpointer';
import type { SupportGraph } from '../../ai/graph/graph';
import { newTurn, type State } from '../../ai/graph/state';
import type { ConversationDoc, MessageDoc } from '../../db/schemas';
import { AppError } from '../../lib/errors';
import { logger } from '../../lib/logger';
import type { ConversationsRepository } from '../conversations/repository';
import { chunkText, ProseFilter, STAGE_FOR_NODE } from './streamMapping';

export interface TurnRunnerDeps {
  graph: SupportGraph;
  conversations: Pick<ConversationsRepository, 'insertMessage'>;
  /** templates.yaml generic_error: stored as the failed assistant message. */
  genericErrorText: string;
  now?: () => Date;
}

export interface TurnRequest {
  conversation: ConversationDoc;
  user: AuthUser;
  content: string;
  forceEscalate: boolean;
}

/** The copilot action awaiting confirmation (UC-05), if the graph is paused on one. */
export async function pendingAction(
  graph: SupportGraph,
  conversationId: string,
): Promise<TimesheetAction | undefined> {
  const snapshot = await graph.getState(threadConfig(conversationId));
  if (!snapshot.next.includes('awaitConfirmation')) return undefined;
  return (snapshot.values as State).output?.action ?? undefined;
}

/** The draft awaiting confirmation, if the conversation's graph is paused on one. */
export async function pendingDraft(
  graph: SupportGraph,
  conversationId: string,
): Promise<TicketDraft | undefined> {
  const snapshot = await graph.getState(threadConfig(conversationId));
  if (!snapshot.next.includes('awaitConfirmation')) return undefined;
  // The graph only pauses after a draft was attached (routeAfterPersist).
  return (snapshot.values as State).output?.draft ?? undefined;
}

export function createTurnRunner(deps: TurnRunnerDeps) {
  const running = new Set<string>();
  const now = deps.now ?? (() => new Date());

  /**
   * Checks and takes the conversation's turn lock, stores the user message and
   * returns a function that runs the turn, emitting events. Throws CONFLICT
   * before anything is written if the turn cannot start.
   */
  async function begin(req: TurnRequest) {
    const conversationId = req.conversation._id.toHexString();
    if (running.has(conversationId)) {
      throw new AppError('CONFLICT', 'A turn is already running in this conversation');
    }
    running.add(conversationId);
    try {
      if (await pendingDraft(deps.graph, conversationId)) {
        throw new AppError('CONFLICT', 'A ticket draft is waiting for your confirmation');
      }
      if (await pendingAction(deps.graph, conversationId)) {
        throw new AppError('CONFLICT', 'A timesheet entry is waiting for your confirmation');
      }
      const userMessage: MessageDoc = {
        _id: new ObjectId(),
        conversationId: req.conversation._id,
        role: 'user',
        content: req.content,
        decision: null,
        reasonCode: null,
        citations: [],
        uncovered: [],
        ticketDraft: null,
        status: 'complete',
        isEval: false,
        createdAt: now(),
      };
      await deps.conversations.insertMessage(userMessage);
      const assistantMessageId = new ObjectId().toHexString();
      return {
        userMessageId: userMessage._id.toHexString(),
        assistantMessageId,
        run: (emit: (event: ChatEvent) => void) =>
          run(req, userMessage._id.toHexString(), assistantMessageId, emit).finally(() =>
            running.delete(conversationId),
          ),
      };
    } catch (err) {
      running.delete(conversationId);
      throw err;
    }
  }

  async function run(
    req: TurnRequest,
    userMessageId: string,
    assistantMessageId: string,
    emit: (event: ChatEvent) => void,
  ): Promise<void> {
    const conversationId = req.conversation._id.toHexString();
    const started = performance.now();
    emit({ type: 'turn_started', data: { userMessageId, assistantMessageId } });
    const input = {
      conversationId,
      userId: req.user.id,
      userMessageId,
      assistantMessageId,
      text: req.content,
      forceEscalate: req.forceEscalate,
    };
    let stage: string | undefined;
    let streamed = false;
    const prose = new ProseFilter();
    try {
      for await (const event of deps.graph.streamEvents(newTurn(input), {
        ...threadConfig(conversationId),
        version: 'v2',
      })) {
        const node = event.metadata?.langgraph_node as string | undefined;
        if (event.event === 'on_chain_start' && node && event.name === node) {
          const next = STAGE_FOR_NODE[node];
          if (next && next !== stage) {
            stage = next;
            emit({ type: 'status', data: { stage: next } });
          }
        } else if (event.event === 'on_chat_model_stream' && node === 'answer') {
          const text = prose.push(chunkText(event.data.chunk?.content));
          if (text) {
            streamed = true;
            emit({ type: 'token', data: { text } });
          }
        }
      }

      const snapshot = await deps.graph.getState(threadConfig(conversationId));
      const state = snapshot.values as State;
      const output = state.output;
      const decision = state.decision;
      if (!output || !decision) throw new Error('turn finished without output or decision');

      if (!streamed && output.text && !output.handoff && !output.withdrawn) {
        // Non-streamed replies (clarifying question, ticket messages) arrive as one token.
        emit({ type: 'token', data: { text: output.text } });
      }
      if (output.withdrawn) {
        emit({
          type: 'withdrawn',
          data: {
            reason: output.withdrawnReason ?? 'NO_VALID_CITATIONS',
            replacementText: output.text,
          },
        });
      } else if (output.citations.length > 0) {
        emit({ type: 'citations', data: { items: output.citations } });
      }
      // A restricted draft is offered through the handoff card, never shown as a ticket draft.
      if (snapshot.next.includes('awaitConfirmation') && output.draft && !output.draft.restricted) {
        emit({
          type: 'ticket_draft',
          data: { draft: { ...output.draft }, missingFields: state.ticketFlow.requiredMissing },
        });
      }
      if (snapshot.next.includes('awaitConfirmation') && output.action) {
        emit({ type: 'action_draft', data: { action: output.action } });
      }
      if (output.handoff) {
        emit({
          type: 'handoff',
          data: {
            kind: output.handoff.kind,
            text: output.text,
            ...(output.handoff.contact && { contact: output.handoff.contact }),
            ...(output.handoff.offerPrivateContact && { offerPrivateContact: true }),
          },
        });
      }
      emit({
        type: 'done',
        data: {
          decision: decision.value,
          reasonCode: decision.reasonCode,
          assistantMessageId,
          latencyMs: Math.round(performance.now() - started),
        },
      });
    } catch (err) {
      const llm = err instanceof Error && err.name === 'LlmError';
      logger.error({ err, conversationId }, 'turn failed');
      try {
        // Never leave a turn without a stored reply: record the failure (status error).
        await deps.conversations.insertMessage({
          _id: new ObjectId(assistantMessageId),
          conversationId: req.conversation._id,
          role: 'assistant',
          content: deps.genericErrorText,
          decision: null,
          reasonCode: null,
          citations: [],
          uncovered: [],
          ticketDraft: null,
          status: 'error',
          isEval: false,
          createdAt: now(),
        });
      } catch (storeErr) {
        logger.error({ err: storeErr, conversationId }, 'could not store the error message');
      }
      emit({
        type: 'error',
        data: {
          code: llm ? 'LLM_UNAVAILABLE' : 'INTERNAL',
          message: deps.genericErrorText,
          retryable: true,
        },
      });
    }
  }

  /** Runs fn while holding the conversation's lock (confirm/cancel); CONFLICT if a turn is running. */
  async function exclusive<T>(conversationId: string, fn: () => Promise<T>): Promise<T> {
    if (running.has(conversationId)) {
      throw new AppError('CONFLICT', 'A turn is already running in this conversation');
    }
    running.add(conversationId);
    try {
      return await fn();
    } finally {
      running.delete(conversationId);
    }
  }

  return { begin, exclusive, isRunning: (conversationId: string) => running.has(conversationId) };
}
export type TurnRunner = ReturnType<typeof createTurnRunner>;
