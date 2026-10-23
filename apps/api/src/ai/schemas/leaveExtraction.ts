// P-12 leave_extract output (UC-11c, ADR-026). The model only reads the request:
// it picks a leave type and copies the date phrases. Code resolves the dates,
// counts working days, checks every leave rule and asks the employee to confirm.
import { LEAVE_TYPES } from '@sd/shared';
import { z } from 'zod';

/** "unknown" when the employee did not say which kind of leave. */
export const UNKNOWN_LEAVE_TYPE = 'unknown';

export const LeaveExtractionSchema = z.object({
  type: z.enum([UNKNOWN_LEAVE_TYPE, ...LEAVE_TYPES]),
  /** The first day as the employee said it, or rewritten from history; null if not given. */
  startText: z.string().trim().max(60).nullable(),
  /** The last day as said ("25" in "Oct 24-25"); null for a single day. */
  endText: z.string().trim().max(60).nullable(),
});
export type LeaveExtraction = z.output<typeof LeaveExtractionSchema>;
