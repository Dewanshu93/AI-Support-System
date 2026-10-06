// P-5 ticket_slot_fill output (playbook section 6). The model proposes; code
// normalises fields to the category schema and decides what is still missing
// (domain/ticketSchemas), so `fields` is an open record here.
import { PRIORITIES } from '@sd/shared';
import { z } from 'zod';
import { maxWords, type SchemaContext } from './common';

export const SLOT_IMPACT_SCOPES = ['me', 'team', 'org'] as const;

export function slotFillSchema(ctx: SchemaContext) {
  const categories = ctx.taxonomy.categories.map((c) => c.id);
  const subcategories = ctx.taxonomy.categories.flatMap((c) => c.subcategories.map((s) => s.id));
  const parentOf = new Map(
    ctx.taxonomy.categories.flatMap((c) => c.subcategories.map((s) => [s.id, c.id] as const)),
  );
  return z
    .object({
      category: z.enum(categories as [string, ...string[]]),
      subcategory: z.enum(subcategories as [string, ...string[]]).optional(),
      urgency: z.enum(PRIORITIES),
      urgencyReason: z.string().trim().min(1).max(300),
      impactScope: z.enum(SLOT_IMPACT_SCOPES),
      summary: z.string().trim().min(1).refine(maxWords(15), 'must be at most 15 words'),
      description: z.string().trim().min(1).refine(maxWords(120), 'must be at most 120 words'),
      alreadyTried: z.array(z.string()),
      /** Verbatim error text the employee quoted. */
      errorMessages: z.array(z.string()),
      /** Field key → value, or "unknown" when the employee never said. */
      fields: z.record(z.string(), z.string()),
      /** The model's view of missing required fields (logged; code decides). */
      requiredMissing: z.array(z.string()),
    })
    .refine((r) => r.subcategory === undefined || parentOf.get(r.subcategory) === r.category, {
      path: ['subcategory'],
      message: 'must belong to the chosen category',
    });
}
export type SlotFillResult = z.output<ReturnType<typeof slotFillSchema>>;
