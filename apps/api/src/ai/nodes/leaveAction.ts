// leaveAgent action node (UC-11c, amendment A-1; mirrors UC-05).
//   leaveApply — AI (P-12 leave_extract) reads the leave type and the date phrases;
//     code resolves the dates, counts working days, checks every leave rule and
//     either asks for what is missing or proposes the exact request. Nothing is
//     written: applyAction books it only after the employee confirms.
import type { LeaveAction, LeaveType } from '@sd/shared';
import { type DateResolution, resolveDateText, resolveRangeEnd } from '../../domain/dateText';
import {
  LEAVE_EXTRACTION_FAILED_REPLY,
  LEAVE_NOT_ELIGIBLE_REPLY,
  leaveConfirmReply,
  leaveMissingReply,
  leaveProblemsReply,
} from '../../domain/workspaceReplies';
import type { DecisionResult, State, StateUpdate } from '../graph/state';
import type { CallPolicy, ChatHandle, CostTable, ModelTier } from '../llm';
import type { PromptRegistry } from '../prompts/registry';
import { LeaveExtractionSchema, UNKNOWN_LEAVE_TYPE } from '../schemas';
import { formatHistory } from './promptFormat';
import { structuredCallWithRetry } from './structuredCall';
import type { WorkspaceRecords } from './workspaceAgents';

const NODE = 'leaveApply';

export interface LeaveApplyDeps {
  prompts: PromptRegistry;
  chatFor: (tier: ModelTier) => ChatHandle;
  policy: CallPolicy;
  costs: CostTable;
  records?: WorkspaceRecords;
}

const decision = (value: DecisionResult['value'], reasonCode: string): DecisionResult => ({
  value,
  reasonCode,
  rulesFired: ['workspace_agent', 'leave_action'],
});

const reply = (text: string, d: DecisionResult, extra: StateUpdate = {}): StateUpdate => ({
  decision: d,
  output: { text, citations: [], uncovered: [], withdrawn: false },
  ...extra,
});

/** "Wednesday 2026-10-07", so the model can quote relative days without computing them. */
const todayLabel = (iso: string) =>
  `${new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'UTC' })} ${iso}`;

const isDate = (r: DateResolution | null): r is { date: string } => !!r && 'date' in r;

export function createLeaveApply(deps: LeaveApplyDeps) {
  return async function leaveApply(state: State): Promise<StateUpdate> {
    const { records } = deps;
    if (!records?.checkLeave || !records.leaveTypes || !records.leave || !state.profile) {
      return reply(
        'I cannot reach your leave records right now. Please use the Leave page.',
        decision('ESCALATE', 'RECORDS_UNAVAILABLE'),
      );
    }
    const who = {
      id: state.input.userId,
      country: state.profile.country,
      employmentType: state.profile.employmentType,
    };
    // Contractors book no company leave: say so without a model call.
    if (who.employmentType !== 'full_time') {
      return reply(LEAVE_NOT_ELIGIBLE_REPLY, decision('ANSWER', 'LEAVE_NOT_ELIGIBLE'));
    }
    const today = records.today();
    const types = records.leaveTypes();

    const { prompt, messages } = await deps.prompts.render('leave_extract', {
      today: todayLabel(today),
      types: types.map((t) => `- ${t.type}: ${t.label}`).join('\n'),
      history: formatHistory(state.history),
      message: state.input.text,
    });
    const { data, llmCalls, errors } = await structuredCallWithRetry({
      node: NODE,
      prompt,
      messages,
      schema: LeaveExtractionSchema,
      chat: deps.chatFor(prompt.modelTier),
      policy: deps.policy,
      costs: deps.costs,
    });
    const traced = (outputs: Record<string, unknown>, flags: string[] = []) => ({
      trace: { llmCalls, errors, outputs: { leaveAction: outputs }, flags },
    });
    if (!data) {
      return reply(
        LEAVE_EXTRACTION_FAILED_REPLY,
        decision('CLARIFY', 'LEAVE_EXTRACTION_FAILED'),
        traced({ extracted: null }, ['LEAVE_EXTRACTION_FALLBACK']),
      );
    }

    // Code resolves the dates. Sick leave is about days just past; other leave lies ahead.
    const type = data.type === UNKNOWN_LEAVE_TYPE ? null : (data.type as LeaveType);
    const ahead = type !== 'sick';
    const start = data.startText ? resolveDateText(data.startText, today, { ahead }) : null;
    const end =
      isDate(start) && data.endText
        ? resolveRangeEnd(data.endText, start.date, today, { ahead })
        : start;
    const unreadableDate =
      data.startText && !isDate(start)
        ? data.startText
        : data.endText && isDate(start) && !isDate(end)
          ? data.endText
          : null;
    if (!type || !isDate(start) || !isDate(end) || unreadableDate) {
      const balances = (await records.leave(who)).balances;
      return reply(
        leaveMissingReply({
          type: !type,
          date: !data.startText,
          unreadableDate,
          typeOptions: balances.map((b) => `${b.label} (${b.available} left)`),
        }),
        decision('CLARIFY', 'LEAVE_DETAILS_MISSING'),
        traced({ extracted: data }),
      );
    }

    // Same rules as the Leave page, checked by code before anything is proposed.
    const application = { type, startDate: start.date, endDate: end.date };
    const check = await records.checkLeave(who, application);
    if (check.problems.length > 0) {
      return reply(
        leaveProblemsReply(check.problems),
        decision('CLARIFY', 'LEAVE_RULES'),
        traced({ extracted: data, application, problems: check.problems }),
      );
    }

    const typeInfo = types.find((t) => t.type === type)!;
    const action: LeaveAction = {
      kind: 'leave_apply',
      type,
      typeLabel: typeInfo.label,
      startDate: application.startDate,
      endDate: application.endDate,
      days: check.dates.length,
      availableAfter: check.availableAfter,
      needsApproval: typeInfo.needsApproval,
      warnings: check.warnings,
    };
    return {
      decision: decision('ANSWER', 'LEAVE_ACTION_PROPOSED'),
      output: {
        text: leaveConfirmReply(action),
        citations: [],
        uncovered: [],
        withdrawn: false,
        action,
      },
      ...traced({ extracted: data, application }),
    };
  };
}
