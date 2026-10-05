// Golden-set case schema (playbook section 8). One JSON object per line in
// evals/golden/golden.v<N>.jsonl.
import { DecisionSchema, PrioritySchema } from '@sd/shared';
import { z } from 'zod';

export const DATASET_VERSION = 'v1';

export const CASE_CATEGORIES = [
  'answerable',
  'partial',
  'clarify',
  'escalate',
  'sensitive',
  'out_of_scope',
] as const;
export type CaseCategory = (typeof CASE_CATEGORIES)[number];

/** The decision each category is labelled with. */
export const CATEGORY_DECISION = {
  answerable: 'ANSWER',
  partial: 'PARTIAL',
  clarify: 'CLARIFY',
  escalate: 'ESCALATE',
  sensitive: 'SENSITIVE_HANDOFF',
  out_of_scope: 'OUT_OF_SCOPE',
} as const satisfies Record<CaseCategory, z.infer<typeof DecisionSchema>>;

export const CATEGORY_CODE = {
  answerable: 'ANS',
  partial: 'PAR',
  clarify: 'CLR',
  escalate: 'ESC',
  sensitive: 'SEN',
  out_of_scope: 'OOS',
} as const satisfies Record<CaseCategory, string>;

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
] as const;
export type CaseTag = (typeof CASE_TAGS)[number];

/** `slug` or `slug@version` (to name one specific version, e.g. a superseded one). */
const DocRef = z
  .string()
  .regex(/^[a-z0-9]+(-[a-z0-9]+)*(@\d+(\.\d+)*)?$/, 'must be slug or slug@version');

export const GoldenCaseSchema = z.strictObject({
  id: z
    .string()
    .regex(/^(IT|HR|GEN)-(ANS|PAR|CLR|ESC|SEN|OOS)-\d{3}$/, 'must look like HR-ANS-007'),
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
