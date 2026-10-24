// P-13 request_change_extract output (UC-17, ADR-028). The model only reads the
// request: what to do, which request as the employee said it, and the comment
// text. Code finds the request among the employee's own, checks the rules and
// asks the employee to confirm.
import { z } from 'zod';

export const REQUEST_OPERATIONS = ['unknown', 'comment', 'withdraw', 'reopen'] as const;

export const RequestChangeExtractionSchema = z.object({
  operation: z.enum(REQUEST_OPERATIONS),
  /** The request as the employee referred to it ("HR-0012", "my VPN ticket"); null if not said. */
  requestRef: z.string().trim().max(120).nullable(),
  /** comment: the text to add, in the employee's words; null otherwise. */
  comment: z.string().trim().max(1000).nullable(),
});
export type RequestChangeExtraction = z.output<typeof RequestChangeExtractionSchema>;
