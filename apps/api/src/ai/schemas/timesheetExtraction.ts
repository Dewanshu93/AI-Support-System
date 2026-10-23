// P-10 timesheet_extract output (UC-05, ADR-015; v2 bulk requests UC-13). The
// model only reads the request: it copies date phrases, picks a project code from
// the employee's own projects and the hours, or (v2) says the request is a bulk one.
// Code resolves the dates, expands bulk requests, maps codes to projects and checks
// every rule before anything is shown or saved.
import { z } from 'zod';

/** "unknown" when the employee did not name a project or it is not one of theirs. */
export const UNKNOWN_PROJECT = 'unknown';

/** v2: requests code expands into days (UC-13); "none" when the entries list the days. */
export const BULK_KINDS = ['none', 'missing_days', 'copy_last_week'] as const;
export type BulkKind = (typeof BULK_KINDS)[number];

/**
 * `projectCodes` are the employee's own project codes, injected per call, so the
 * model cannot name a project the employee may not log time against.
 */
export function timesheetExtractionSchema(projectCodes: readonly string[]) {
  const projectCode = z.enum([UNKNOWN_PROJECT, ...projectCodes] as [string, ...string[]]);
  return z
    .object({
      entries: z
        .array(
          z.object({
            /** The date as the employee said it, or rewritten from history ("that day" → "11 September"); null if not given. */
            dateText: z.string().trim().max(60).nullable(),
            projectCode,
            /** Hours for that day and project; null if not given. */
            hours: z.number().min(0).max(24).nullable(),
          }),
        )
        .max(7),
      /** v2 only (absent in v1 output = none). Days are never named here: code picks them. */
      bulk: z
        .object({
          kind: z.enum(BULK_KINDS),
          /** missing_days: the project to fill with. */
          projectCode: projectCode.optional(),
          /** missing_days: hours per day; null = up to the required hours. */
          hours: z.number().min(0).max(24).nullable().optional(),
        })
        .optional(),
    })
    .refine((x) => x.entries.length > 0 || (x.bulk && x.bulk.kind !== 'none'), {
      path: ['entries'],
      message: 'give at least one entry, or a bulk request',
    });
}
export type TimesheetExtraction = z.output<ReturnType<typeof timesheetExtractionSchema>>;
