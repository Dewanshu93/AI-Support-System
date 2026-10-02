import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DEFAULT_CONFIG_DIR } from '../../src/config';

/** Copies the committed config/ dir to a temp dir so tests can break one file. */
export function copyConfigDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sd-config-'));
  fs.cpSync(DEFAULT_CONFIG_DIR, dir, { recursive: true });
  return dir;
}

export function removeDir(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

export const VALID_ENV = {
  MONGODB_URI: 'mongodb://localhost:27017/servicedesk?directConnection=true',
  JWT_SECRET: 'test-secret-that-is-at-least-32-bytes-long',
} as const;
