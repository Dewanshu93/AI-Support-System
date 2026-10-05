// P-3 grounded_answer: streamed prose with [Sx] markers, then a fenced JSON
// trailer validated by this schema (playbook section 6).
import { z } from 'zod';

export const ANSWER_MODES = ['answer', 'partial', 'safety_steps'] as const;
export type AnswerMode = (typeof ANSWER_MODES)[number];

export const GroundedAnswerTrailerSchema = z.object({
  /** Parts of the question the sources do not cover. */
  uncovered: z.array(z.string()),
});
export type GroundedAnswerTrailer = z.output<typeof GroundedAnswerTrailerSchema>;
