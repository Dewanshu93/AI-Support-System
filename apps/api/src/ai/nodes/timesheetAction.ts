// timesheetAgent action nodes (UC-05, Build Contract v2.0 flow 3).
//   timesheetLog — AI (P-10 timesheet_extract) reads what to log; code resolves
//     the dates, maps project codes, checks every timesheet rule and either asks
//     for what is missing or proposes the exact entries. Nothing is written.
//   applyAction — code, graph-owned tool node: runs only after the employee
//     confirmed the proposed entries (awaitConfirmation) and saves them through
//     the same service as the timesheet form.
import type { ActionResult, TimesheetAction } from '@sd/shared';
import { ObjectId } from 'mongodb';
import { resolveDateText } from '../../domain/dateText';
import {
  type ProposedEntry,
  TIMESHEET_EXTRACTION_FAILED_REPLY,
  timesheetAppliedReply,
  timesheetConfirmReply,
  timesheetMissingReply,
  timesheetProblemsReply,
} from '../../domain/workspaceReplies';
import type { ConversationsRepository } from '../../modules/conversations/repository';
import type { DecisionResult, State, StateUpdate } from '../graph/state';
import type { CallPolicy, ChatHandle, CostTable, ModelTier } from '../llm';
import type { PromptRegistry } from '../prompts/registry';
import { timesheetExtractionSchema, UNKNOWN_PROJECT } from '../schemas';
import { formatHistory } from './promptFormat';
import { structuredCallWithRetry } from './structuredCall';
import type { ProposedCell, WorkspaceRecords } from './workspaceAgents';

const NODE = 'timesheetLog';

export interface TimesheetLogDeps {
  prompts: PromptRegistry;
  chatFor: (tier: ModelTier) => ChatHandle;
  policy: CallPolicy;
  costs: CostTable;
  records?: WorkspaceRecords;
}

const decision = (value: DecisionResult['value'], reasonCode: string): DecisionResult => ({
  value,
  reasonCode,
  rulesFired: ['workspace_agent', 'timesheet_action'],
});

const reply = (text: string, d: DecisionResult, extra: StateUpdate = {}): StateUpdate => ({
  decision: d,
  output: { text, citations: [], uncovered: [], withdrawn: false },
  ...extra,
});

/** "Wednesday 2026-10-07", so the model can quote relative days without computing them. */
const todayLabel = (iso: string) =>
  `${new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'UTC' })} ${iso}`;

export function createTimesheetLog(deps: TimesheetLogDeps) {
  return async function timesheetLog(state: State): Promise<StateUpdate> {
    const { records } = deps;
    if (!records || !state.profile) {
      return reply(
        'I cannot reach your timesheet right now. Please use the Timesheets page.',
        decision('ESCALATE', 'RECORDS_UNAVAILABLE'),
      );
    }
    const who = { id: state.input.userId, country: state.profile.country };
    const today = records.today();
    const projects = await records.projects(who.id);
    const byCode = new Map(projects.map((p) => [p.code, p]));

    const { prompt, messages } = await deps.prompts.render('timesheet_extract', {
      today: todayLabel(today),
      projects: projects.map((p) => `- ${p.code}: ${p.name}`).join('\n') || '(none)',
      history: formatHistory(state.history),
      message: state.input.text,
    });
    const { data, llmCalls, errors } = await structuredCallWithRetry({
      node: NODE,
      prompt,
      messages,
      schema: timesheetExtractionSchema(projects.map((p) => p.code)),
      chat: deps.chatFor(prompt.modelTier),
      policy: deps.policy,
      costs: deps.costs,
    });
    const traced = (outputs: Record<string, unknown>, flags: string[] = []) => ({
      trace: { llmCalls, errors, outputs: { timesheetAction: outputs }, flags },
    });
    if (!data) {
      return reply(
        TIMESHEET_EXTRACTION_FAILED_REPLY,
        decision('CLARIFY', 'TIMESHEET_EXTRACTION_FAILED'),
        traced({ extracted: null }, ['TIMESHEET_EXTRACTION_FALLBACK']),
      );
    }

    // Code turns the extraction into cells: dates resolved, projects mapped.
    const cells: ProposedCell[] = [];
    let missingDate = false;
    let unreadableDate: string | null = null;
    let missingProject = false;
    let missingHours = false;
    for (const e of data.entries) {
      const resolved = e.dateText ? resolveDateText(e.dateText, today) : null;
      if (!e.dateText) missingDate = true;
      else if (resolved && 'error' in resolved) unreadableDate ??= e.dateText;
      const project = e.projectCode === UNKNOWN_PROJECT ? undefined : byCode.get(e.projectCode);
      if (!project) missingProject = true;
      if (e.hours === null) missingHours = true;
      if (resolved && 'date' in resolved && project && e.hours !== null) {
        cells.push({ date: resolved.date, projectId: project.id, hours: e.hours });
      }
    }
    if (missingDate || unreadableDate || missingProject || missingHours) {
      return reply(
        timesheetMissingReply({
          date: missingDate,
          unreadableDate,
          project: missingProject,
          hours: missingHours,
          projectNames: projects.map((p) => p.name),
        }),
        decision('CLARIFY', 'TIMESHEET_DETAILS_MISSING'),
        traced({ extracted: data.entries, cells }),
      );
    }

    // Same rules as the timesheet form, checked by code before anything is proposed.
    const preview = await records.previewTimesheet(who, cells);
    if (preview.problems.length > 0) {
      return reply(
        timesheetProblemsReply(preview.problems),
        decision('CLARIFY', 'TIMESHEET_RULES'),
        traced({ extracted: data.entries, cells, problems: preview.problems }),
      );
    }

    const entries: ProposedEntry[] = preview.entries.map((e) => ({
      ...e,
      projectName: projects.find((p) => p.id === e.projectId)!.name,
    }));
    const action: TimesheetAction = {
      kind: 'timesheet_log',
      entries: preview.entries.map((e) => {
        const project = projects.find((p) => p.id === e.projectId)!;
        return { ...e, projectName: project.name, projectColor: project.color };
      }),
    };
    return {
      ...reply(timesheetConfirmReply(entries), decision('ANSWER', 'TIMESHEET_ACTION_PROPOSED')),
      output: {
        text: timesheetConfirmReply(entries),
        citations: [],
        uncovered: [],
        withdrawn: false,
        action,
      },
      ...traced({ extracted: data.entries, cells }),
    };
  };
}

export interface ApplyActionDeps {
  records?: WorkspaceRecords;
  conversations: Pick<ConversationsRepository, 'insertMessage'>;
  now?: () => Date;
  isEval?: boolean;
}

/**
 * Saves the confirmed entries exactly as shown (no model involved). If a rule
 * fails now (the timesheet changed since the proposal), nothing is saved and
 * the failure is recorded. The outcome is written to the conversation.
 */
export function createApplyAction(deps: ApplyActionDeps) {
  const now = deps.now ?? (() => new Date());
  return async function applyAction(state: State): Promise<StateUpdate> {
    const action = state.output?.action;
    if (!action) throw new Error('applyAction: no action to apply');
    if (!deps.records || !state.profile) throw new Error('applyAction: records unavailable');
    const who = { id: state.input.userId, country: state.profile.country };
    const cells = action.entries.map(({ date, projectId, hours }) => ({ date, projectId, hours }));

    let result: ActionResult;
    try {
      const { saved } = await deps.records.saveTimesheet(who, cells, 'copilot');
      result = { status: 'applied', message: timesheetAppliedReply(action.entries), saved };
    } catch (err) {
      const issues = (err as { details?: { issues?: { message: string }[] } }).details?.issues;
      result = {
        status: 'failed',
        message: `Nothing was saved: ${issues?.map((i) => i.message).join('; ') ?? 'the timesheet could not be updated'}. Please check the Timesheets page.`,
        saved: 0,
      };
    }
    await deps.conversations.insertMessage({
      _id: new ObjectId(),
      conversationId: new ObjectId(state.input.conversationId),
      role: 'system_event',
      content: result.message,
      decision: null,
      reasonCode: null,
      citations: [],
      uncovered: [],
      ticketDraft: null,
      status: 'complete',
      isEval: deps.isEval ?? false,
      createdAt: now(),
    });
    return {
      output: { ...state.output!, actionResult: result },
      trace: { outputs: { actionResult: result } },
    };
  };
}
