// P-1 turn_analysis output (playbook section 6).
import { DOMAINS, PRIORITIES } from '@sd/shared';
import { z } from 'zod';
import { maxWords, type SchemaContext } from './common';

export const TURN_INTENTS = [
  'question',
  'report_issue',
  'request_action',
  'talk_to_human',
  'follow_up',
  'out_of_scope',
] as const;

/**
 * What the employee wants from their own workspace records (UC-04, P-1 v2).
 * Code routes on it to an agent subgraph; "none" keeps the policy and ticket flow.
 */
export const WORKSPACE_INTENTS = [
  'none',
  'timesheet_log',
  'timesheet_status',
  'payroll_explain',
  'request_status',
] as const;
export type WorkspaceIntent = (typeof WORKSPACE_INTENTS)[number];

/** Category and subcategory enums come from config/taxonomy.yaml. */
export function turnAnalysisSchema(ctx: SchemaContext) {
  const categories = ctx.taxonomy.categories.map((c) => c.id);
  const subcategories = ctx.taxonomy.categories.flatMap((c) => c.subcategories.map((s) => s.id));
  const parentOf = new Map(
    ctx.taxonomy.categories.flatMap((c) => c.subcategories.map((s) => [s.id, c.id] as const)),
  );
  return z
    .object({
      intent: z.enum(TURN_INTENTS),
      domain: z.enum([...DOMAINS, 'unknown']),
      /** Taxonomy category id, or "none" when no category fits (e.g. out of scope). */
      category: z.enum(['none', ...categories]),
      subcategory: z.enum(subcategories as [string, ...string[]]).optional(),
      urgency: z.enum(PRIORITIES),
      urgencyReason: z.string().trim().min(1).max(300),
      sensitivity: z.enum(['none', 'sensitive']),
      sensitivityReason: z.string().max(300).optional(),
      ambiguity: z.enum(['low', 'high']),
      ambiguityReason: z.string().max(300).optional(),
      /** Standalone search query, pronouns resolved from history. */
      searchQuery: z.string().trim().min(1).refine(maxWords(30), 'must be at most 30 words'),
      /** Absent in P-1 v1 output; treated as "none". */
      workspaceIntent: z.enum(WORKSPACE_INTENTS).optional(),
    })
    .refine((a) => a.subcategory === undefined || parentOf.get(a.subcategory) === a.category, {
      path: ['subcategory'],
      message: 'must belong to the chosen category',
    });
}
export type TurnAnalysis = z.output<ReturnType<typeof turnAnalysisSchema>>;

export const workspaceIntentOf = (analysis: TurnAnalysis | null): WorkspaceIntent =>
  analysis?.workspaceIntent ?? 'none';
