// Encryption at rest for connected-tool tokens (UC-18, ADR-032): AES-256-GCM with
// a random 12-byte IV per value. The key is TOKEN_ENCRYPTION_KEY (32 bytes, base64).
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import type { EncryptedSecret } from '../../db/schemas';

export interface TokenCipher {
  encrypt(plain: string): EncryptedSecret;
  /** Throws when the value was not written with this key or was altered. */
  decrypt(secret: EncryptedSecret): string;
}

export function createTokenCipher(base64Key: string): TokenCipher {
  const key = Buffer.from(base64Key, 'base64');
  if (key.length !== 32) throw new Error('TOKEN_ENCRYPTION_KEY must be 32 bytes, base64-encoded');
  return {
    encrypt(plain) {
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', key, iv);
      const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
      return {
        iv: iv.toString('base64'),
        tag: cipher.getAuthTag().toString('base64'),
        data: data.toString('base64'),
      };
    },
    decrypt(secret) {
      const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(secret.iv, 'base64'));
      decipher.setAuthTag(Buffer.from(secret.tag, 'base64'));
      return Buffer.concat([
        decipher.update(Buffer.from(secret.data, 'base64')),
        decipher.final(),
      ]).toString('utf8');
    },
  };
}
