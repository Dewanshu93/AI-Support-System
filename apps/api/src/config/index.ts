import fs from 'node:fs';
import path from 'node:path';
import { findCrossFileProblems } from './crossChecks';
import { type Env, parseEnv } from './env';
import { ConfigError } from './errors';
import { CONFIG_FILES, type ConfigFiles } from './schemas';
import { loadYamlFile } from './yaml';

export { ConfigError } from './errors';
export type { Env } from './env';
export * from './schemas';

/** Repository root; same depth from src/config and dist/config. */
export const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
export const DEFAULT_CONFIG_DIR = path.join(REPO_ROOT, 'config');

export type AppConfig = Readonly<{ env: Env; configDir: string } & ConfigFiles>;

/**
 * Loads `.env` into process.env if present (ENV_FILE overrides the path).
 * Variables already set in the environment win over the file.
 */
export function loadDotEnv(file = process.env.ENV_FILE ?? path.join(REPO_ROOT, '.env')): void {
  if (fs.existsSync(file)) process.loadEnvFile(file);
}

/** Validates env and every config file. Throws ConfigError on the first broken source. */
export function loadConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  const env = parseEnv(source);
  const configDir = env.CONFIG_DIR ? path.resolve(env.CONFIG_DIR) : DEFAULT_CONFIG_DIR;

  const files = Object.fromEntries(
    Object.entries(CONFIG_FILES).map(([key, { file, schema }]) => [
      key,
      loadYamlFile(configDir, file, schema),
    ]),
  ) as ConfigFiles;

  const problems = findCrossFileProblems(files);
  if (problems.length > 0) {
    throw new ConfigError(
      `Config files are inconsistent:\n${problems.map((p) => `  - ${p}`).join('\n')}`,
    );
  }

  return deepFreeze({ env, configDir, ...files });
}

let current: AppConfig | undefined;

/** Loads config once at startup and makes it available through getConfig(). */
export function initConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  current = loadConfig(source);
  return current;
}

export function getConfig(): AppConfig {
  if (!current) throw new Error('Config not initialised: call initConfig() at startup');
  return current;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
