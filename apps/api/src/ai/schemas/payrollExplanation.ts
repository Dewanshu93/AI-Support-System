// P-11 payroll_explain output (UC-06, ADR-015). The model explains how the cited
// policy applies to the employee's records; code writes the records part and
// checks every citation and number in this explanation.
import { z } from 'zod';
import { maxWords } from './common';

export const PayrollExplanationSchema = z.object({
  /** Policy explanation with [Sx] markers; no figures beyond the records and sources. */
  explanation: z.string().trim().min(1).refine(maxWords(150), 'must be at most 150 words'),
});
export type PayrollExplanation = z.output<typeof PayrollExplanationSchema>;
