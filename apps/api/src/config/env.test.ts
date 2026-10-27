import { parseEnv } from './env';
import { ConfigError } from './errors';

const valid = {
  MONGODB_URI: 'mongodb://localhost:27017/servicedesk?directConnection=true',
  JWT_SECRET: 'x'.repeat(32),
};

function errorOf(fn: () => unknown): ConfigError {
  try {
    fn();
  } catch (err) {
    if (err instanceof ConfigError) return err;
    throw err;
  }
  throw new Error('expected a ConfigError');
}

describe('parseEnv', () => {
  it('applies defaults to a minimal valid env', () => {
    expect(parseEnv(valid)).toEqual({
      ...valid,
      NODE_ENV: 'development',
      API_PORT: 4000,
      WEB_ORIGIN: 'http://localhost:3000',
      LOG_LEVEL: 'info',
      QDRANT_URL: 'http://localhost:6333',
      LLM_MODE: 'live',
      EMAIL_DELIVERY: 'mock',
      RATE_LIMIT_SCALE: 1,
      JIRA_REDIRECT_URI: 'http://localhost:3000/api/integrations/jira/callback',
      GITHUB_REDIRECT_URI: 'http://localhost:3000/api/integrations/github/callback',
    });
  });

  it('accepts a 32-byte base64 TOKEN_ENCRYPTION_KEY and rejects any other length', () => {
    const key = Buffer.alloc(32, 1).toString('base64');
    expect(parseEnv({ ...valid, TOKEN_ENCRYPTION_KEY: key }).TOKEN_ENCRYPTION_KEY).toBe(key);
    expect(() =>
      parseEnv({ ...valid, TOKEN_ENCRYPTION_KEY: Buffer.alloc(16).toString('base64') }),
    ).toThrow(/TOKEN_ENCRYPTION_KEY/);
  });

  it('accepts EMAIL_DELIVERY=smtp and treats a blank value as mock', () => {
    expect(parseEnv({ ...valid, EMAIL_DELIVERY: 'smtp' }).EMAIL_DELIVERY).toBe('smtp');
    expect(parseEnv({ ...valid, EMAIL_DELIVERY: '' }).EMAIL_DELIVERY).toBe('mock');
  });

  it('coerces API_PORT and accepts mongodb+srv URIs', () => {
    const env = parseEnv({
      ...valid,
      API_PORT: '5050',
      MONGODB_URI: 'mongodb+srv://user:pw@cluster0.example.net/servicedesk',
    });
    expect(env.API_PORT).toBe(5050);
  });

  it('treats blank optional values (as in .env.example) as unset', () => {
    const env = parseEnv({ ...valid, GEMINI_API_KEY: '', DEMO_PASSWORD: '  ', API_PORT: '' });
    expect(env.GEMINI_API_KEY).toBeUndefined();
    expect(env.DEMO_PASSWORD).toBeUndefined();
    expect(env.API_PORT).toBe(4000);
  });

  it('names every missing required variable in one readable message', () => {
    const err = errorOf(() => parseEnv({ JWT_SECRET: '' }));
    expect(err.message).toContain('Invalid environment variables');
    expect(err.message).toContain('  - MONGODB_URI: is required');
    expect(err.message).toContain('  - JWT_SECRET: is required');
    expect(err.message).toContain('.env.example');
  });

  it.each([
    ['JWT_SECRET', 'too-short', 'JWT_SECRET: must be at least 32 characters'],
    ['MONGODB_URI', 'postgres://localhost', 'MONGODB_URI: must start with mongodb://'],
    ['API_PORT', '70000', 'API_PORT:'],
    ['API_PORT', 'abc', 'API_PORT:'],
    ['NODE_ENV', 'staging', 'NODE_ENV:'],
    ['WEB_ORIGIN', 'not a url', 'WEB_ORIGIN:'],
    ['EMAIL_DELIVERY', 'sendgrid', 'EMAIL_DELIVERY:'],
  ])('rejects invalid %s=%s', (key, value, expected) => {
    expect(errorOf(() => parseEnv({ ...valid, [key]: value })).message).toContain(expected);
  });
});
