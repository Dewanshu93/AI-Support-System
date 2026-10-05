import type { ConfigFiles } from '../../config/schemas';

/** Config-derived values injected into schemas so prompts and validation never drift. */
export interface SchemaContext {
  taxonomy: ConfigFiles['taxonomy'];
}

/** Refinement: at most `max` whitespace-separated words. */
export const maxWords = (max: number) => (s: string) =>
  s.trim().split(/\s+/).filter(Boolean).length <= max;
