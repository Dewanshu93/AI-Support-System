// requestsAgent action node (UC-17, ADR-028).
//   requestChange — AI (P-13 request_change_extract) reads what to do, which request
//     and the comment text; code finds the request among the employee's own, checks
//     the requester rules and proposes the exact change. Nothing changes until the
//     employee confirms (applyAction, through the request page's service).
import type { RequestChangeAction } from '@sd/shared';
import { checkRequestChange, fitsChange, type RequestChange } from '../../domain/requestChanges';
import {
  REQUEST_CHANGE_EXTRACTION_FAILED_REPLY,
  REQUEST_CHANGE_WHAT_REPLY,
  requestChangeConfirmReply,
  requestCommentMissingReply,
  requestNoneReply,
  requestNotFoundReply,
  requestRuleReply,
  requestWhichReply,
} from '../../domain/workspaceReplies';
import type { DecisionResult, State, StateUpdate } from '../graph/state';
import type { CallPolicy, ChatHandle, CostTable, ModelTier } from '../llm';
import type { PromptRegistry } from '../prompts/registry';
import { RequestChangeExtractionSchema } from '../schemas';
import { formatHistory } from './promptFormat';
import { structuredCallWithRetry } from './structuredCall';
import type { WorkspaceRecords } from './workspaceAgents';

const NODE = 'requestChange';
const HUMAN_ID = /\b(IT|HR)-\d{4,}\b/i;

export interface RequestChangeDeps {
  prompts: PromptRegistry;
  chatFor: (tier: ModelTier) => ChatHandle;
  policy: CallPolicy;
  costs: CostTable;
  records?: WorkspaceRecords;
}

const decision = (value: DecisionResult['value'], reasonCode: string): DecisionResult => ({
  value,
  reasonCode,
  rulesFired: ['workspace_agent', 'request_change'],
});

const reply = (text: string, d: DecisionResult, extra: StateUpdate = {}): StateUpdate => ({
  decision: d,
  output: { text, citations: [], uncovered: [], withdrawn: false },
  ...extra,
});

/** Placeholder for graphs built without records (older tests). */
export function requestChangeUnavailable(_state: State): StateUpdate {
  return reply(
    'I cannot change your requests right now. Open the request in Requests instead.',
    decision('ESCALATE', 'RECORDS_UNAVAILABLE'),
  );
}

export function createRequestChange(deps: RequestChangeDeps) {
  return async function requestChange(state: State): Promise<StateUpdate> {
    const { records } = deps;
    if (!records?.ownRequests || !records.changeRequest) return requestChangeUnavailable(state);
    const own = await records.ownRequests(state.input.userId);

    const { prompt, messages } = await deps.prompts.render('request_change_extract', {
      requests: own.map((r) => `- ${r.humanId}: ${r.summary}`).join('\n') || '(none)',
      history: formatHistory(state.history),
      message: state.input.text,
    });
    const { data, llmCalls, errors } = await structuredCallWithRetry({
      node: NODE,
      prompt,
      messages,
      schema: RequestChangeExtractionSchema,
      chat: deps.chatFor(prompt.modelTier),
      policy: deps.policy,
      costs: deps.costs,
    });
    const traced = (outputs: Record<string, unknown>, flags: string[] = []) => ({
      trace: { llmCalls, errors, outputs: { requestChange: outputs }, flags },
    });
    if (!data) {
      return reply(
        REQUEST_CHANGE_EXTRACTION_FAILED_REPLY,
        decision('CLARIFY', 'REQUEST_CHANGE_EXTRACTION_FAILED'),
        traced({ extracted: null }, ['REQUEST_CHANGE_EXTRACTION_FALLBACK']),
      );
    }
    const clarify = (text: string, reasonCode: string, extra: Record<string, unknown> = {}) =>
      reply(text, decision('CLARIFY', reasonCode), traced({ extracted: data, ...extra }));

    if (data.operation === 'unknown')
      return clarify(REQUEST_CHANGE_WHAT_REPLY, 'REQUEST_DETAILS_MISSING');
    const change: RequestChange = data.operation;

    // Code finds the request: a number the employee gave, else the only one that fits.
    const named = (data.requestRef?.match(HUMAN_ID) ?? state.input.text.match(HUMAN_ID))?.[0];
    let target: (typeof own)[number] | undefined;
    if (named) {
      target = own.find((r) => r.humanId.toLowerCase() === named.toLowerCase());
      if (!target) return clarify(requestNotFoundReply(named.toUpperCase()), 'REQUEST_NOT_FOUND');
    } else {
      const candidates = own.filter((r) => fitsChange(change, r.status));
      if (candidates.length === 0) return clarify(requestNoneReply(change), 'REQUEST_RULES');
      if (candidates.length > 1) {
        return clarify(requestWhichReply(change, candidates), 'REQUEST_DETAILS_MISSING');
      }
      target = candidates[0]!;
    }

    const check = checkRequestChange(change, target.status);
    if (!check.ok) {
      return clarify(requestRuleReply(target.humanId, change, check.reason), 'REQUEST_RULES', {
        ticket: target.humanId,
      });
    }
    if (change === 'comment' && !data.comment) {
      return clarify(requestCommentMissingReply(target.humanId), 'REQUEST_DETAILS_MISSING');
    }

    const action: RequestChangeAction = {
      kind: 'request_change',
      change,
      ticketId: target.id,
      humanId: target.humanId,
      summary: target.summary,
      comment: change === 'comment' ? data.comment : null,
      statusAfter: check.to,
    };
    return {
      decision: decision('ANSWER', 'REQUEST_CHANGE_PROPOSED'),
      output: {
        text: requestChangeConfirmReply(action),
        citations: [],
        uncovered: [],
        withdrawn: false,
        action,
      },
      ...traced({ extracted: data, ticket: target.humanId }),
    };
  };
}
