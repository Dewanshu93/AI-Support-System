// Copilot action confirmation (UC-05, UC-11c; Build Contract v2.0 flow 3 and rule E.4).
// Nothing is written before confirm: confirm resumes the graph paused in
// awaitConfirmation, and applyAction saves the exact entries shown. Confirm is
// idempotent: a second confirm returns the first result.
import { Command } from '@langchain/langgraph';
import type { ActionResult, AuthUser, CopilotAction } from '@sd/shared';
import { ObjectId } from 'mongodb';
import { threadConfig } from '../../ai/graph/checkpointer';
import type { SupportGraph } from '../../ai/graph/graph';
import type { State } from '../../ai/graph/state';
import type { ConversationDoc } from '../../db/schemas';
import { AppError } from '../../lib/errors';
import type { ConversationsRepository } from '../conversations/repository';

export interface ActionServiceDeps {
  graph: SupportGraph;
  conversations: Pick<ConversationsRepository, 'findConversation' | 'insertMessage'>;
  getOwned(id: string, user: AuthUser): Promise<ConversationDoc>;
  /** Serialises confirm/cancel with chat turns of the same conversation. */
  exclusive<T>(conversationId: string, fn: () => Promise<T>): Promise<T>;
  now?: () => Date;
}

export const ACTION_CANCELLED_TEXT = 'Timesheet entry cancelled. Nothing was saved.';
export const LEAVE_CANCELLED_TEXT = 'Leave request cancelled. Nothing was booked.';

export const REQUEST_CHANGE_CANCELLED_TEXT = 'Cancelled. Your request was not changed.';

const cancelledText = (action: CopilotAction | undefined) =>
  action?.kind === 'leave_apply'
    ? LEAVE_CANCELLED_TEXT
    : action?.kind === 'request_change'
      ? REQUEST_CHANGE_CANCELLED_TEXT
      : ACTION_CANCELLED_TEXT;

export function createActionService(deps: ActionServiceDeps) {
  const now = deps.now ?? (() => new Date());

  async function paused(conversationId: string) {
    const snapshot = await deps.graph.getState(threadConfig(conversationId));
    const output = (snapshot.values as State | undefined)?.output;
    return {
      waiting: snapshot.next.includes('awaitConfirmation') && !!output?.action,
      action: output?.action,
      result: output?.actionResult,
    };
  }

  return {
    async confirm(
      id: string,
      user: AuthUser,
    ): Promise<{ action: CopilotAction; result: ActionResult; applied: boolean }> {
      await deps.getOwned(id, user);
      return deps.exclusive(id, async () => {
        const before = await paused(id);
        if (!before.waiting) {
          // Idempotent: a repeated confirm returns the result already recorded.
          if (before.action && before.result) {
            return { action: before.action, result: before.result, applied: false };
          }
          throw new AppError('NOT_FOUND', 'There is nothing to confirm');
        }
        await deps.graph.invoke(new Command({ resume: { action: 'confirm' } }), threadConfig(id));
        const after = await paused(id);
        if (!after.result) throw new Error(`conversation ${id}: action confirmed without a result`);
        return { action: before.action!, result: after.result, applied: true };
      });
    },

    async cancel(id: string, user: AuthUser): Promise<ConversationDoc> {
      await deps.getOwned(id, user);
      return deps.exclusive(id, async () => {
        const before = await paused(id);
        if (!before.waiting) {
          throw new AppError('NOT_FOUND', 'There is nothing to cancel');
        }
        await deps.graph.invoke(new Command({ resume: { action: 'cancel' } }), threadConfig(id));
        await deps.conversations.insertMessage({
          _id: new ObjectId(),
          conversationId: new ObjectId(id),
          role: 'system_event',
          content: cancelledText(before.action),
          decision: null,
          reasonCode: null,
          citations: [],
          uncovered: [],
          ticketDraft: null,
          status: 'complete',
          isEval: false,
          createdAt: now(),
        });
        return (await deps.conversations.findConversation(id))!;
      });
    },
  };
}
export type ActionService = ReturnType<typeof createActionService>;
