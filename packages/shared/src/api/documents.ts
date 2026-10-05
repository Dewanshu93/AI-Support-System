// Knowledge document metadata (playbook section 7, ingestion step 2): Markdown
// YAML frontmatter in corpus/, or the metadata JSON of the admin upload (W4-04).
import { z } from 'zod';
import {
  AccessLevelSchema,
  CountrySchema,
  DocumentStatusSchema,
  DomainSchema,
  EmploymentTypeSchema,
} from '../enums';

/** e.g. `3.1`. Always a string: quote it in YAML so `3.0` is not read as a number. */
export const DocumentVersionSchema = z
  .string({ error: 'must be a quoted string such as "3.1"' })
  .regex(/^\d+(\.\d+)*$/, 'must look like 3 or 3.1');

const uniqueList = <T extends z.ZodType<string>>(item: T) =>
  z
    .array(item)
    .min(1)
    .refine((values) => new Set(values).size === values.length, 'must not repeat values');

/** Missing or invalid metadata fails ingestion; no defaults are guessed. */
export const DocumentMetadataSchema = z.strictObject({
  slug: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'must be kebab-case'),
  title: z.string().trim().min(1),
  domain: DomainSchema,
  owner: z.string().trim().min(1),
  version: DocumentVersionSchema,
  effectiveDate: z.coerce.date({ error: 'must be a date such as 2026-01-01' }),
  countries: uniqueList(CountrySchema),
  employmentTypes: uniqueList(EmploymentTypeSchema),
  /** Minimum access level required to read the document. */
  accessLevel: AccessLevelSchema,
  status: DocumentStatusSchema,
  /** Version of the same slug that this document replaces, or null. */
  supersedes: DocumentVersionSchema.nullable(),
});
export type DocumentMetadata = z.infer<typeof DocumentMetadataSchema>;

/** Numeric comparison of dotted versions: 10.0 > 9.2 > 9.1. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}
