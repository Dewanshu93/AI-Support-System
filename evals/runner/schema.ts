// Golden-set case schema (playbook section 8). One JSON object per line in
// evals/golden/golden.v<N>.jsonl.
import { DecisionSchema, PrioritySchema } from '@sd/shared';
import { z } from 'zod';
import { WORKSPACE_INTENTS, type WorkspaceIntent } from '../../apps/api/src/ai/schemas';

export const DATASET_VERSION = 'v1';

/** Policy and ticket cases (playbook section 8). */
export const KNOWLEDGE_CATEGORIES = [
  'answerable',
  'partial',
  'clarify',
  'escalate',
  'sensitive',
  'out_of_scope',
] as const;
/** Employee-records copilot cases (UC-09; Build Contract v2.0 section R). */
export const WORKSPACE_CATEGORIES = [
  'timesheet_log',
  'timesheet_status',
  'payroll',
  'request_status',
  // P-1 v3 (amendment A-1): UC-11 leave, UC-12 daily briefing.
  'leave_balance',
  'leave_apply',
  'daily_briefing',
] as const;
export const CASE_CATEGORIES = [...KNOWLEDGE_CATEGORIES, ...WORKSPACE_CATEGORIES] as const;
export type CaseCategory = (typeof CASE_CATEGORIES)[number];
export type WorkspaceCategory = (typeof WORKSPACE_CATEGORIES)[number];
export const isWorkspaceCategory = (c: CaseCategory): c is WorkspaceCategory =>
  (WORKSPACE_CATEGORIES as readonly string[]).includes(c);

/**
 * The decision each category is labelled with. Records replies are answers from
 * data (ANSWER); a timesheet request with missing details is a CLARIFY, listed per
 * case in acceptableDecisions.
 */
export const CATEGORY_DECISION = {
  answerable: 'ANSWER',
  partial: 'PARTIAL',
  clarify: 'CLARIFY',
  escalate: 'ESCALATE',
  sensitive: 'SENSITIVE_HANDOFF',
  out_of_scope: 'OUT_OF_SCOPE',
  timesheet_log: 'ANSWER',
  timesheet_status: 'ANSWER',
  payroll: 'ANSWER',
  request_status: 'ANSWER',
  leave_balance: 'ANSWER',
  leave_apply: 'ANSWER',
  daily_briefing: 'ANSWER',
} as const satisfies Record<CaseCategory, z.infer<typeof DecisionSchema>>;

export const CATEGORY_CODE = {
  answerable: 'ANS',
  partial: 'PAR',
  clarify: 'CLR',
  escalate: 'ESC',
  sensitive: 'SEN',
  out_of_scope: 'OOS',
  timesheet_log: 'TSL',
  timesheet_status: 'TSS',
  payroll: 'PAY',
  request_status: 'REQ',
  leave_balance: 'LBL',
  leave_apply: 'LAP',
  daily_briefing: 'BRF',
} as const satisfies Record<CaseCategory, string>;

/** The P-1 workspace intent that routes each workspace category to its agent. */
export const CATEGORY_INTENT = {
  timesheet_log: 'timesheet_log',
  timesheet_status: 'timesheet_status',
  payroll: 'payroll_explain',
  request_status: 'request_status',
  leave_balance: 'leave_balance',
  leave_apply: 'leave_apply',
  daily_briefing: 'daily_briefing',
} as const satisfies Record<WorkspaceCategory, WorkspaceIntent>;

/**
 * Section 8 cross-cutting tags, plus labels the validator uses for composition:
 * holdout (excluded from threshold tuning), multi_doc, safety, indirect (sensitive
 * phrasing that the keyword precheck does not catch).
 */
export const CASE_TAGS = [
  'injection',
  'superseded_trap',
  'profile_variant',
  'multi_turn',
  'table',
  'general_it',
  'holdout',
  'multi_doc',
  'safety',
  'indirect',
  // Three quick retrieval cases for the E2E smoke run of the eval page (W4-05).
  'smoke',
] as const;
export type CaseTag = (typeof CASE_TAGS)[number];

/** `slug` or `slug@version` (to name one specific version, e.g. a superseded one). */
const DocRef = z
  .string()
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*(@\d+(\.\d+)*)?$/, 'must be slug or slug@version');

export const GoldenCaseSchema = z.strictObject({
  id: z
    .string()
    .regex(
      /^((IT|HR|GEN)-(ANS|PAR|CLR|ESC|SEN|OOS)|WS-(TSL|TSS|PAY|REQ|LBL|LAP|BRF))-\d{3}$/,
      'must look like HR-ANS-007 or WS-TSL-001',
    ),
  category: z.enum(CASE_CATEGORIES),
  tags: z
    .array(z.enum(CASE_TAGS))
    .refine((t) => new Set(t).size === t.length, 'must not repeat tags'),
  /** Seeded user whose profile applies. */
  userEmail: z.email(),
  /** User turns only; assistant turns are generated live. Multi-turn cases include planned clarification answers. */
  turns: z
    .array(z.strictObject({ role: z.literal('user'), content: z.string().trim().min(1) }))
    .min(1),
  expected: z.strictObject({
    decision: DecisionSchema,
    acceptableDecisions: z.array(DecisionSchema).min(1).optional(),
    /** The P-1 workspace intent; required for workspace categories, "none" elsewhere when given. */
    workspaceIntent: z.enum(WORKSPACE_INTENTS).optional(),
    /** A timesheet entry, leave request or ticket draft must be waiting for the employee's confirmation. */
    awaitsConfirmation: z.boolean().optional(),
    /** At least one must be in the top 5 retrieved and cited. */
    docSlugs: z.array(DocRef),
    /** Superseded or wrong-profile documents: never retrieved into context or cited. */
    forbiddenDocSlugs: z.array(DocRef),
    /** Facts the answer must contain, verbatim from an expected document. */
    keyFacts: z.array(z.string().trim().min(1)),
    ticket: z
      .strictObject({
        category: z.string().min(1),
        subcategory: z.string().min(1).optional(),
        minPriority: PrioritySchema,
        /** Expected extracted fields; "unknown" when the employee never said. */
        fields: z.record(z.string(), z.string().min(1)),
      })
      .optional(),
  }),
  notes: z.string().trim().min(1),
});
export type GoldenCase = z.infer<typeof GoldenCaseSchema>;
