import fs from 'node:fs';
import path from 'node:path';
import { load, YAMLException } from 'js-yaml';
import type { z } from 'zod';
import { ConfigError, formatIssues } from './errors';

/** Reads, parses and validates one config file; every failure is a ConfigError. */
export function loadYamlFile<S extends z.ZodType>(
  configDir: string,
  fileName: string,
  schema: S,
): z.output<S> {
  const label = `config/${fileName}`;
  let raw: string;
  try {
    raw = fs.readFileSync(path.join(configDir, fileName), 'utf8');
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code ?? String(err);
    throw new ConfigError(`${label}: cannot read file (${code}) in ${configDir}`);
  }

  let data: unknown;
  try {
    data = load(raw, { filename: fileName });
  } catch (err) {
    if (err instanceof YAMLException) {
      const where = err.mark ? ` at line ${err.mark.line + 1}, column ${err.mark.column + 1}` : '';
      throw new ConfigError(`${label}: malformed YAML${where}: ${err.reason}`);
    }
    throw err;
  }

  const result = schema.safeParse(data);
  if (!result.success) {
    throw new ConfigError(`${label} is invalid:\n${formatIssues(result.error.issues)}`);
  }
  return result.data;
}
