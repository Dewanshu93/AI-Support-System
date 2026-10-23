// The runtime turn graph: supportTurnGraph with every real node wired to its
// dependencies. server.ts builds it with real providers; tests build it with fake models.
import type { BaseCheckpointSaver } from '@langchain/langgraph';
import type { ConfigFiles } from '../../config/schemas';
import type { ConversationsRepository } from '../../modules/conversations/repository';
import type { TicketsRepository } from '../../modules/tickets/repository';
import type { UsersRepository } from '../../modules/users/repository';
import { compilePrecheckRules } from '../guards/precheckRules';
import type { CallPolicy, ChatHandle, CostTable, ModelTier } from '../llm';
import { createAgentSummary } from '../nodes/agentSummary';
import { createAnalyzeTurn } from '../nodes/analyzeTurn';
import { createAnswer } from '../nodes/answer';
import { createBuildDraft } from '../nodes/buildDraft';
import { createClarifyForTicket } from '../nodes/clarifyForTicket';
import { createCreateTicket } from '../nodes/createTicket';
import { createSlotFill } from '../nodes/slotFill';
import { createLeaveApply } from '../nodes/leaveAction';
import { createApplyAction, createTimesheetLog } from '../nodes/timesheetAction';
import { createClarify } from '../nodes/clarify';
import { createDecide } from '../nodes/decide';
import { createLoadContext } from '../nodes/loadContext';
import { createOutOfScope } from '../nodes/outOfScope';
import { createPayrollExplain, createPayrollRecords } from '../nodes/payrollAgent';
import { createPersist } from '../nodes/persist';
import { createPrecheck } from '../nodes/precheck';
import { createRerankAssess } from '../nodes/rerankAssess';
import { createRetrieve, type RetrieveNodeDeps } from '../nodes/retrieve';
import { createSendEmail, type SendEmailDeps } from '../nodes/sendEmail';
import { createSensitiveHandoff } from '../nodes/sensitiveHandoff';
import { createValidateCitations } from '../nodes/validateCitations';
import {
  createDailyBriefing,
  createLeaveBalance,
  createRequestStatus,
  createTimesheetStatus,
  type WorkspaceRecords,
} from '../nodes/workspaceAgents';
import type { PromptRegistry } from '../prompts/registry';
import { buildSupportGraph, type SupportGraph } from './graph';

export interface TurnGraphDeps {
  config: Pick<
    ConfigFiles,
    | 'thresholds'
    | 'templates'
    | 'taxonomy'
    | 'sensitive'
    | 'priorityRules'
    | 'routing'
    | 'ticketSchemas'
  > & {
    models: { call: CallPolicy; costs: CostTable };
  };
  prompts: PromptRegistry;
  chatFor: (tier: ModelTier, options?: { temperature?: number }) => ChatHandle;
  users: Pick<UsersRepository, 'findById'>;
  conversations: ConversationsRepository;
  tickets: TicketsRepository;
  retrieve: RetrieveNodeDeps['retrieve'];
  checkpointer: BaseCheckpointSaver;
  now?: () => Date;
  /** The employee's own records for the timesheet and requests agents (UC-04). */
  records?: WorkspaceRecords;
  /** The escalation email outbox (UC-07); without it confirmed escalations send no email. */
  email?: SendEmailDeps['email'];
  /** Eval runs: persisted records are marked isEval. */
  isEval?: boolean;
  /** True while serving a Pro-off request (ADR-020): lighter steps for the local model. */
  localMode?: () => boolean;
}

export function buildTurnGraph(deps: TurnGraphDeps): SupportGraph {
  const { config } = deps;
  const templates = config.templates.templates;
  const llm = {
    prompts: deps.prompts,
    chatFor: deps.chatFor,
    policy: config.models.call,
    costs: config.models.costs,
  };
  return buildSupportGraph({
    checkpointer: deps.checkpointer,
    nodes: {
      loadContext: createLoadContext({
        users: deps.users,
        conversations: deps.conversations,
        historyLimit: config.thresholds.conversation.historyMessages,
      }),
      precheck: createPrecheck(compilePrecheckRules(config.sensitive, config.priorityRules)),
      analyzeTurn: createAnalyzeTurn({ ...llm, taxonomy: config.taxonomy }),
      retrieve: createRetrieve({ retrieve: deps.retrieve }),
      rerankAssess: createRerankAssess({
        ...llm,
        retrieval: config.thresholds.retrieval,
        skipModel: deps.localMode,
      }),
      decide: createDecide(config.thresholds.decision),
      answer: createAnswer(llm),
      validateCitations: createValidateCitations({ templates }),
      clarify: createClarify({ ...llm, templates }),
      outOfScope: createOutOfScope({ templates }),
      sensitiveHandoff: createSensitiveHandoff({ templates, routing: config.routing }),
      slotFill: createSlotFill({
        ...llm,
        taxonomy: config.taxonomy,
        ticketSchemas: config.ticketSchemas.schemas,
        records: deps.records,
      }),
      clarifyForTicket: createClarifyForTicket({
        ...llm,
        ticketSchemas: config.ticketSchemas.schemas,
        templates,
      }),
      buildDraft: createBuildDraft({
        routing: config.routing,
        priorityRules: config.priorityRules,
        ticketSchemas: config.ticketSchemas.schemas,
        templates,
        taxonomy: config.taxonomy,
        users: deps.users,
        records: deps.records,
      }),
      createTicket: createCreateTicket({
        tickets: deps.tickets,
        users: deps.users,
        conversations: deps.conversations,
        routing: config.routing,
        priorityRules: config.priorityRules,
        ticketSchemas: config.ticketSchemas.schemas,
        templates,
        duplicateWindowDays: config.thresholds.ticket.duplicateWindowDays,
        now: deps.now,
        isEval: deps.isEval,
      }),
      // Without an email service (older tests, eval runner) the default stub records nothing.
      ...(deps.email && {
        sendEmail: createSendEmail({
          email: deps.email,
          tickets: deps.tickets,
          users: deps.users,
          conversations: deps.conversations,
          routing: config.routing,
          templates,
          now: deps.now,
          isEval: deps.isEval,
        }),
      }),
      agentSummary: createAgentSummary({ ...llm, tickets: deps.tickets }),
      timesheetStatus: createTimesheetStatus({ records: deps.records }),
      timesheetLog: createTimesheetLog({ ...llm, records: deps.records }),
      applyAction: createApplyAction({
        records: deps.records,
        conversations: deps.conversations,
        now: deps.now,
        isEval: deps.isEval,
      }),
      requestStatus: createRequestStatus({ records: deps.records }),
      leaveBalance: createLeaveBalance({ records: deps.records }),
      leaveApply: createLeaveApply({ ...llm, records: deps.records }),
      dailyBriefing: createDailyBriefing({ records: deps.records }),
      payrollRecords: createPayrollRecords({ records: deps.records }),
      payrollExplain: createPayrollExplain(llm),
      persist: createPersist({
        conversations: deps.conversations,
        thresholds: config.thresholds.decision,
        now: deps.now,
        isEval: deps.isEval,
      }),
    },
  });
}
