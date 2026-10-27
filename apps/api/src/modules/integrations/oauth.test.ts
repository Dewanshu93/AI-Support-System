import {
  callJson,
  IntegrationAuthError,
  IntegrationUnavailableError,
  parseTokenResponse,
} from './oauth';

const now = new Date('2026-10-07T09:00:00Z');
const answering = (status: number, body = '{}') =>
  (async () => new Response(body, { status })) as unknown as typeof fetch;

describe('parseTokenResponse', () => {
  it('reads tokens, expiry and scopes', () => {
    expect(
      parseTokenResponse(
        { access_token: 'a', refresh_token: 'r', expires_in: 60, scope: 'x y' },
        now,
      ),
    ).toEqual({
      accessToken: 'a',
      refreshToken: 'r',
      expiresAt: new Date('2026-10-07T09:01:00Z'),
      scopes: ['x', 'y'],
    });
  });

  it('has no expiry for tokens that do not expire', () => {
    expect(parseTokenResponse({ access_token: 'a' }, now).expiresAt).toBeNull();
  });

  it('treats an error field as a refused token (GitHub answers 200)', () => {
    expect(() => parseTokenResponse({ error: 'bad_verification_code' }, now)).toThrow(
      IntegrationAuthError,
    );
  });
});

describe('callJson', () => {
  it('maps refused statuses to an auth error and the rest to unavailable', async () => {
    await expect(callJson(answering(401), 'u', {})).rejects.toBeInstanceOf(IntegrationAuthError);
    await expect(callJson(answering(403), 'u', {})).rejects.toBeInstanceOf(IntegrationAuthError);
    await expect(callJson(answering(403), 'u', {}, [401])).rejects.toBeInstanceOf(
      IntegrationUnavailableError,
    );
    await expect(callJson(answering(500), 'u', {})).rejects.toBeInstanceOf(
      IntegrationUnavailableError,
    );
    await expect(callJson(answering(200, 'not json'), 'u', {})).rejects.toBeInstanceOf(
      IntegrationUnavailableError,
    );
  });
});
