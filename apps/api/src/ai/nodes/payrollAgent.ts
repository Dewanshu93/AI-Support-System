// payrollAgent nodes (UC-06, Build Contract v2.0 flow 5, rule E.2).
//   payrollRecords — code: reads the payslips, Loss of Pay days and their
//     attendance and timesheet records; contractors get the fixed agency reply.
//   payrollExplain — AI (P-11 payroll_explain): explains, from the cited policy,
//     how the policy applies to those records. validateCitations checks it.
//   payrollCompose — code: "Your records" (code-written figures), "What the
//     policy says" (the checked explanation), "Next steps" (code).
// Retrieval and rerank run between records and explanation, as in the knowledge agent.
import {
  PAID_BY_AGENCY_REPLY,
  type PayrollFacts,
  payrollFactsForModel,
  payrollReply,
} from '../../domain/workspaceReplies';
import type { DecisionResult, State, StateUpdate } from '../graph/state';
import type { CallPolicy, ChatHandle, CostTable, ModelTier } from '../llm';
import type { PromptRegistry } from '../prompts/registry';
import { PayrollExplanationSchema } from '../schemas';
import { formatSources } from './answer';
import { languageVariable } from './promptFormat';
import { structuredCallWithRetry } from './structuredCall';
import type { WorkspaceRecords } from './workspaceAgents';

export const PAYROLL_EXPLANATION_FALLBACK = 'PAYROLL_EXPLANATION_FALLBACK';
/** The explanation failed the citation or number check and was not shown. */
export const PAYROLL_EXPLANATION_WITHDRAWN = 'PAYROLL_EXPLANATION_WITHDRAWN';

const decision = (value: DecisionResult['value'], reasonCode: string): DecisionResult => ({
  value,
  reasonCode,
  rulesFired: ['workspace_agent', 'payroll_agent'],
});

/** Search terms the records make relevant, added by code to the employee's question. */
export function payrollSearchTerms(facts: PayrollFacts): string {
  return facts.lopDays.length > 0
    ? 'Loss of Pay deduction missing timesheet attendance absent payroll cutoff reversal'
    : 'payslip deductions pay dates payroll query';
}

export function createPayrollRecords({ records }: { records?: WorkspaceRecords }) {
  return async function payrollRecords(state: State): Promise<StateUpdate> {
    if (!records || !state.profile) {
      return {
        decision: decision('ESCALATE', 'RECORDS_UNAVAILABLE'),
        output: {
          text: 'I cannot read your pay records right now. Please open Payroll in the menu, or try again shortly.',
          citations: [],
          uncovered: [],
          withdrawn: false,
        },
      };
    }
    const facts = await records.payroll({
      id: state.input.userId,
      country: state.profile.country,
      employmentType: state.profile.employmentType,
    });
    const traceRecords = {
      paidByAgency: facts.paidByAgency,
      payslips: facts.payslips.map((p) => p.payDate),
      lopDays: facts.lopDays.map((d) => d.date),
    };
    if (facts.paidByAgency) {
      return {
        payroll: facts,
        decision: decision('ANSWER', 'RECORDS_PAID_BY_AGENCY'),
        output: { text: PAID_BY_AGENCY_REPLY, citations: [], uncovered: [], withdrawn: false },
        trace: { outputs: { payrollRecords: traceRecords } },
      };
    }
    // The question is searched together with the terms its records make relevant;
    // the model's analysis is left as it was (retrievalQuery is per turn).
    const query = state.analysis?.searchQuery ?? state.input.text;
    return {
      payroll: facts,
      retrievalQuery: `${query} ${payrollSearchTerms(facts)}`,
      trace: { outputs: { payrollRecords: traceRecords } },
    };
  };
}

export interface PayrollExplainDeps {
  prompts: PromptRegistry;
  chatFor: (tier: ModelTier) => ChatHandle;
  policy: CallPolicy;
  costs: CostTable;
}

export function createPayrollExplain(deps: PayrollExplainDeps) {
  return async function payrollExplain(state: State): Promise<StateUpdate> {
    const facts = state.payroll;
    if (!facts) throw new Error('payrollExplain: payrollRecords did not run');
    const context = state.retrieval?.context ?? [];
    const answer = (text: string, reasonCode: string) => ({
      decision: decision('ANSWER', reasonCode),
      output: { text, citations: [], uncovered: [], withdrawn: false, mode: 'answer' as const },
    });
    if (context.length === 0) {
      // Nothing to cite: payrollCompose shows the records and the fallback line.
      return {
        ...answer('', 'PAYROLL_NO_POLICY'),
        trace: { flags: [PAYROLL_EXPLANATION_FALLBACK] },
      };
    }
    const { prompt, messages } = await deps.prompts.render('payroll_explain', {
      // A figure-free summary: amounts, dates and pay are shown by code, never sent to the model.
      records: payrollFactsForModel(facts),
      question: state.input.text,
      sources: formatSources(context),
      ...languageVariable(deps.prompts, 'payroll_explain', state),
    });
    const { data, llmCalls, errors } = await structuredCallWithRetry({
      node: 'payrollExplain',
      prompt,
      messages,
      schema: PayrollExplanationSchema,
      chat: deps.chatFor(prompt.modelTier),
      policy: deps.policy,
      costs: deps.costs,
    });
    if (!data) {
      return {
        ...answer('', 'PAYROLL_NO_POLICY'),
        trace: { llmCalls, errors, flags: [PAYROLL_EXPLANATION_FALLBACK] },
      };
    }
    return {
      ...answer(data.explanation, 'PAYROLL_EXPLAINED'),
      trace: { llmCalls, errors, outputs: { payrollExplanation: data } },
    };
  };
}

/**
 * Writes the reply. The explanation is used only if validateCitations kept it
 * (valid citations, numbers found in the cited sources); otherwise the records
 * and next steps are still shown, with a line saying no policy text was found.
 */
export function payrollCompose(state: State): StateUpdate {
  const facts = state.payroll;
  if (!facts) throw new Error('payrollCompose: payrollRecords did not run');
  const output = state.output;
  const explained = !!output?.text && !output.withdrawn && output.citations.length > 0;
  const withdrawn = !!output?.text && output.withdrawn;
  return {
    ...(withdrawn && { trace: { flags: [PAYROLL_EXPLANATION_WITHDRAWN] } }),
    // A withdrawn explanation is not an escalation here: the records answer the question.
    decision: decision(
      'ANSWER',
      explained
        ? 'PAYROLL_EXPLAINED'
        : withdrawn
          ? PAYROLL_EXPLANATION_WITHDRAWN
          : 'PAYROLL_RECORDS_ONLY',
    ),
    output: {
      text: payrollReply(facts, explained ? output!.text : null),
      citations: explained ? output!.citations : [],
      uncovered: [],
      withdrawn: false,
    },
  };
}
