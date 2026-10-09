import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { copyConfigDir, removeDir, VALID_ENV } from '../test/helpers/config';

// Acceptance (W1-02): a missing env var or malformed YAML stops startup with a
// clear message. Runs the real entry point in a child process.
const tsxCli = require.resolve('tsx/cli');
const serverEntry = path.join(__dirname, 'server.ts');

function startServer(extraEnv: Record<string, string>) {
  return spawnSync(process.execPath, [tsxCli, serverEntry], {
    env: {
      PATH: process.env.PATH ?? '',
      SystemRoot: process.env.SystemRoot ?? '',
      // Never pick up a developer's real .env.
      ENV_FILE: path.join(__dirname, 'does-not-exist.env'),
      ...extraEnv,
    },
    encoding: 'utf8',
    // Loading LangChain under tsx takes ~10 s alone, longer when Jest runs suites in parallel.
    timeout: 90_000,
  });
}

describe('server startup', () => {
  it('exits 1 with a readable message when env vars are missing', () => {
    const result = startServer({});
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Startup aborted: configuration error');
    expect(result.stderr).toContain('MONGODB_URI: is required');
    expect(result.stderr).toContain('JWT_SECRET: is required');
  });

  it('exits 1 with a readable message when a config file is malformed', () => {
    const dir = copyConfigDir();
    try {
      fs.writeFileSync(path.join(dir, 'routing.yaml'), 'routes: {hardware: it_hardware\n');
      const result = startServer({ ...VALID_ENV, CONFIG_DIR: dir });
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('config/routing.yaml: malformed YAML at line');
    } finally {
      removeDir(dir);
    }
  });

  // Acceptance (W2-01): an active prompt without its file stops startup.
  it('exits 1 when config/prompts.yaml activates a prompt version that does not exist', () => {
    const dir = copyConfigDir();
    try {
      const file = path.join(dir, 'prompts.yaml');
      fs.writeFileSync(
        file,
        fs.readFileSync(file, 'utf8').replace(/turn_analysis: \d+/, 'turn_analysis: 9'),
      );
      const result = startServer({ ...VALID_ENV, CONFIG_DIR: dir });
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('activates turn_analysis v9');
      expect(result.stderr).toContain('turn_analysis/v9.md does not exist');
    } finally {
      removeDir(dir);
    }
  });
});
