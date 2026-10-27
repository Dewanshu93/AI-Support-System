import { randomBytes } from 'node:crypto';
import { createTokenCipher } from './tokenCrypto';

const key = randomBytes(32).toString('base64');

describe('createTokenCipher', () => {
  it('round-trips a token without storing it in clear', () => {
    const cipher = createTokenCipher(key);
    const secret = cipher.encrypt('access-token-123');
    expect(JSON.stringify(secret)).not.toContain('access-token-123');
    expect(cipher.decrypt(secret)).toBe('access-token-123');
  });

  it('uses a fresh IV every time', () => {
    const cipher = createTokenCipher(key);
    expect(cipher.encrypt('same').iv).not.toBe(cipher.encrypt('same').iv);
  });

  it('rejects an altered value or another key', () => {
    const cipher = createTokenCipher(key);
    const secret = cipher.encrypt('token');
    const altered = { ...secret, data: Buffer.from('other!').toString('base64') };
    expect(() => cipher.decrypt(altered)).toThrow();
    expect(() => createTokenCipher(randomBytes(32).toString('base64')).decrypt(secret)).toThrow();
  });

  it('refuses a key that is not 32 bytes', () => {
    expect(() => createTokenCipher(randomBytes(16).toString('base64'))).toThrow(/32 bytes/);
  });
});
