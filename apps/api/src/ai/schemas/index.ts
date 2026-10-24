// Zod output schemas for LLM calls (playbook section 6): the single definition
// of every structured LLM output. Avoid z.literal: Gemini's native structured
// output rejects JSON Schema `const`; use z.enum instead.
import type { z } from 'zod';
import { AgentSummaryResultSchema } from './agentSummary';
import { ClarifyingQuestionSchema } from './clarifyingQuestion';
import type { SchemaContext } from './common';
import { AgentDraftReplySchema } from './draftReply';
import { GapClusterLabelSchema } from './gapClusterLabel';
import { GroundedAnswerTrailerSchema } from './groundedAnswer';
import { LeaveExtractionSchema } from './leaveExtraction';
import { PayrollExplanationSchema } from './payrollExplanation';
import { RerankAssessmentSchema } from './rerank';
import { RequestChangeExtractionSchema } from './requestChangeExtraction';
import { slotFillSchema } from './slotFill';
import { timesheetExtractionSchema } from './timesheetExtraction';
import { turnAnalysisSchema } from './turnAnalysis';

export * from './agentSummary';
export * from './clarifyingQuestion';
export * from './common';
export * from './draftReply';
export * from './gapClusterLabel';
export * from './groundedAnswer';
export * from './leaveExtraction';
export * from './payrollExplanation';
export * from './rerank';
export * from './requestChangeExtraction';
export * from './slotFill';
export * from './timesheetExtraction';
export * from './turnAnalysis';

/** Prompt frontmatter `outputSchema` name → schema factory. */
export const OUTPUT_SCHEMAS = {
  TurnAnalysis: (ctx: SchemaContext) => turnAnalysisSchema(ctx),
  RerankAssessment: () => RerankAssessmentSchema,
  GroundedAnswerTrailer: () => GroundedAnswerTrailerSchema,
  ClarifyingQuestion: () => ClarifyingQuestionSchema,
  SlotFillResult: (ctx: SchemaContext) => slotFillSchema(ctx),
  // Project codes are per employee: the node builds the strict schema per call.
  TimesheetExtraction: () => timesheetExtractionSchema([]),
  PayrollExplanation: () => PayrollExplanationSchema,
  LeaveExtraction: () => LeaveExtractionSchema,
  RequestChangeExtraction: () => RequestChangeExtractionSchema,
  AgentSummary: () => AgentSummaryResultSchema,
  AgentDraftReply: () => AgentDraftReplySchema,
  GapClusterLabel: () => GapClusterLabelSchema,
} as const satisfies Record<string, (ctx: SchemaContext) => z.ZodType>;
export type OutputSchemaName = keyof typeof OUTPUT_SCHEMAS;
export const OUTPUT_SCHEMA_NAMES = Object.keys(OUTPUT_SCHEMAS) as [
  OutputSchemaName,
  ...OutputSchemaName[],
];
