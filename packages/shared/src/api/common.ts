// Building blocks reused by every endpoint group (playbook section 4 conventions).
import { z } from 'zod';

/** A MongoDB ObjectId as it appears in URLs and JSON (24 hex characters). */
export const ObjectIdStringSchema = z.string().regex(/^[a-f0-9]{24}$/i, 'must be a valid id');

/** `?limit` (default 20, max 100) and `?cursor` on every list endpoint. */
export const PaginationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().min(1).optional(),
});
export type PaginationQuery = z.infer<typeof PaginationQuerySchema>;

/** List response shape: `{ items, nextCursor }`; nextCursor is null on the last page. */
export function paginatedSchema<T extends z.ZodType>(item: T) {
  return z.object({ items: z.array(item), nextCursor: z.string().nullable() });
}
