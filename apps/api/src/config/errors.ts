import type { z } from 'zod';

/** Thrown for any invalid env var or config file; startup prints it and exits. */
export class ConfigError extends Error {
  override name = 'ConfigError';
}

/** One readable line per Zod issue: `  - path.to.field: message`. */
export function formatIssues(issues: readonly z.core.$ZodIssue[]): string {
  return issues
    .map((issue) => {
      const where = issue.path.length > 0 ? issue.path.map(String).join('.') : '(root)';
      return `  - ${where}: ${issue.message}`;
    })
    .join('\n');
}
