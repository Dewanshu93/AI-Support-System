import fs from 'node:fs';
import path from 'node:path';
import { ConfigError, getConfig, initConfig, loadConfig } from './index';
import { copyConfigDir, removeDir, VALID_ENV } from '../../test/helpers/config';

describe('loadConfig', () => {
  let dir: string;
  beforeEach(() => (dir = copyConfigDir()));
  afterEach(() => removeDir(dir));

  const load = () => loadConfig({ ...VALID_ENV, CONFIG_DIR: dir });
  const write = (file: string, text: string) => fs.writeFileSync(path.join(dir, file), text);
  const edit = (file: string, from: string | RegExp, to: string) => {
    const text = fs.readFileSync(path.join(dir, file), 'utf8');
    const next = text.replace(from, to);
    if (next === text) throw new Error(`fixture edit did not apply to ${file}`);
    write(file, next);
  };
  const messageOf = (): string => {
    try {
      load();
    } catch (err) {
      if (err instanceof ConfigError) return err.message;
      throw err;
    }
    throw new Error('expected a ConfigError');
  };

  it('loads the committed config with typed values', () => {
    const config = load();
    expect(config.configDir).toBe(path.resolve(dir));
    expect(config.thresholds.decision.answerMinRelevance).toBe(2);
    expect(config.models.chat.provider).toBe('gemini');
    expect(config.routing.routes.hardware).toBe('it_hardware');
    expect(config.prompts.active.turn_analysis).toBe(1);
  });

  it('returns a deeply frozen config', () => {
    const config = load();
    expect(Object.isFrozen(config.thresholds.retrieval)).toBe(true);
    expect(() => {
      (config.thresholds.retrieval as { rrfK: number }).rrfK = 1;
    }).toThrow(TypeError);
  });

  it('reports malformed YAML with file name and line', () => {
    write('thresholds.yaml', 'version: 1\ndecision: [unclosed\n');
    expect(messageOf()).toMatch(
      /^config\/thresholds\.yaml: malformed YAML at line \d+, column \d+/,
    );
  });

  it('reports a missing file', () => {
    fs.unlinkSync(path.join(dir, 'models.yaml'));
    expect(messageOf()).toContain('config/models.yaml: cannot read file (ENOENT)');
  });

  it('reports schema violations with the field path', () => {
    edit('thresholds.yaml', 'rrfK: 60', 'rrfK: -1');
    expect(messageOf()).toContain('config/thresholds.yaml is invalid:\n  - retrieval.rrfK:');
  });

  it('validates env before reading any file', () => {
    expect(() => loadConfig({ CONFIG_DIR: dir })).toThrow(/Invalid environment variables/);
  });

  describe('cross-file checks', () => {
    it('rejects a taxonomy category without a queue', () => {
      edit('routing.yaml', /^ {2}network: it_software\r?\n/m, '');
      expect(messageOf()).toContain('taxonomy category "network" has no queue in routing.yaml');
    });

    it('rejects a route for an unknown category', () => {
      edit('routing.yaml', 'routes:\n', 'routes:\n  printers: it_hardware\n');
      expect(messageOf()).toContain('routing.yaml routes unknown category "printers"');
    });

    it('rejects routing an IT category to an HR queue', () => {
      edit('routing.yaml', 'hardware: it_hardware', 'hardware: hr_general');
      expect(messageOf()).toContain('routes IT category "hardware" to HR queue "hr_general"');
    });

    it('rejects a category without a ticket schema', () => {
      edit('ticket-schemas.yaml', /^ {2}policy:\r?\n(?: {4}.*\r?\n)+/m, '');
      expect(messageOf()).toContain('"policy" has no entry in ticket-schemas.yaml');
    });

    it('rejects a non-HR sensitive queue', () => {
      edit('routing.yaml', 'sensitiveQueue: hr_case', 'sensitiveQueue: it_access');
      expect(messageOf()).toContain('sensitiveQueue "it_access" must be an HR queue');
    });

    it('rejects an email address on the sensitive queue', () => {
      edit(
        'routing.yaml',
        'label: HR Confidential Cases }',
        'label: HR Confidential Cases, email: cases@example.com }',
      );
      expect(messageOf()).toContain('sensitiveQueue "hr_case" must not have an email');
    });
  });
});

describe('config singleton', () => {
  it('getConfig returns what initConfig loaded', () => {
    const config = initConfig({ ...VALID_ENV });
    expect(getConfig()).toBe(config);
  });
});
