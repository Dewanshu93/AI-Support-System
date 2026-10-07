// P-10 timesheet_extract output (UC-05, ADR-015). The model only reads the
// request: it copies date phrases, picks a project code from the employee's own
// projects and the hours. Code resolves the dates, maps codes to projects and
// checks every rule before anything is shown or saved.
import { z } from 'zod';

/** "unknown" when the employee did not name a project or it is not one of theirs. */
export const UNKNOWN_PROJECT = 'unknown';

/**
 * `projectCodes` are the employee's own project codes, injected per call, so the
 * model cannot name a project the employee may not log time against.
 */
export function timesheetExtractionSchema(projectCodes: readonly string[]) {
  return z.object({
    entries: z
      .array(
        z.object({
          /** The date as the employee said it, or rewritten from history ("that day" → "11 September"); null if not given. */
          dateText: z.string().trim().max(60).nullable(),
          projectCode: z.enum([UNKNOWN_PROJECT, ...projectCodes] as [string, ...string[]]),
          /** Hours for that day and project; null if not given. */
          hours: z.number().min(0).max(24).nullable(),
        }),
      )
      .min(1)
      .max(7),
  });
}
export type TimesheetExtraction = z.output<ReturnType<typeof timesheetExtractionSchema>>;
