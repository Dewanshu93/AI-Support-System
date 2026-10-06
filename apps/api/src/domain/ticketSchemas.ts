// Per-category ticket fields (playbook W3-01; config/ticket-schemas.yaml). Pure.
// Absent information is the literal "unknown"; never guessed.
import type { ConfigFiles } from '../config/schemas';

type Schemas = ConfigFiles['ticketSchemas']['schemas'];
export type TicketField = Schemas[string]['fields'][number];

export const UNKNOWN = 'unknown';

export function fieldsFor(schemas: Schemas, category: string): TicketField[] {
  const schema = schemas[category];
  if (!schema) throw new Error(`no ticket schema for category "${category}" (ticket-schemas.yaml)`);
  return schema.fields;
}

const isKnown = (value: string | undefined) =>
  value !== undefined && value.trim() !== '' && value.trim().toLowerCase() !== UNKNOWN;

/**
 * Keeps exactly the category's fields, in schema order: extra keys are dropped,
 * missing or blank values become "unknown".
 */
export function normaliseFields(
  schemas: Schemas,
  category: string,
  values: Record<string, string>,
): Record<string, string> {
  return Object.fromEntries(
    fieldsFor(schemas, category).map((f) => {
      const value = values[f.key];
      return [f.key, isKnown(value) ? value!.trim() : UNKNOWN];
    }),
  );
}

/** Keys of required fields that are still unknown, in schema order. */
export function requiredMissing(
  schemas: Schemas,
  category: string,
  values: Record<string, string>,
): string[] {
  return fieldsFor(schemas, category)
    .filter((f) => f.required && !isKnown(values[f.key]))
    .map((f) => f.key);
}

/**
 * Edit keys the category schema does not have. A confirm with any of them is
 * rejected (400): edits can only change fields, never the requester, queue or
 * priority, which code sets.
 */
export function unknownEditKeys(
  schemas: Schemas,
  category: string,
  edits: Record<string, string>,
): string[] {
  const keys = new Set(fieldsFor(schemas, category).map((f) => f.key));
  return Object.keys(edits).filter((k) => !keys.has(k));
}
