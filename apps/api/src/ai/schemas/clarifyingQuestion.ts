// P-4 clarifying_question output (playbook section 6).
import { z } from 'zod';
import { maxWords } from './common';

export const CLARIFY_MODES = ['ambiguity', 'ticket_fields'] as const;
export type ClarifyMode = (typeof CLARIFY_MODES)[number];

export const ClarifyingQuestionSchema = z.object({
  question: z.string().trim().min(1).refine(maxWords(40), 'must be at most 40 words'),
  /** Ticket field keys asked for (at most 2; empty in ambiguity mode). */
  fieldsAsked: z.array(z.string()).max(2),
});
export type ClarifyingQuestion = z.output<typeof ClarifyingQuestionSchema>;
