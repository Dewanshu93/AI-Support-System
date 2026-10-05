import { DemoUsersResponseSchema } from '@sd/shared';
import { api, ApiError, apiRequest } from './api';

function respond(status: number, body?: unknown, headers: Record<string, string> = {}) {
  return jest.spyOn(global, 'fetch').mockResolvedValue(
    new Response(body === undefined ? null : JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json', ...headers },
    }),
  );
}

afterEach(() => jest.restoreAllMocks());

describe('apiRequest', () => {
  it('calls the same-origin /api path with credentials and validates the response', async () => {
    const fetchMock = respond(200, { users: [], passwordRequired: false });
    const data = await apiRequest('/auth/demo-users', DemoUsersResponseSchema);
    expect(data).toEqual({ users: [], passwordRequired: false });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/auth/demo-users');
    expect(init).toMatchObject({ method: 'GET', credentials: 'include' });
    expect((init!.headers as Record<string, string>)['X-Requested-With']).toBeUndefined();
  });

  it('sends JSON and the app header on mutations', async () => {
    const fetchMock = respond(204);
    await api.logout();
    const init = fetchMock.mock.calls[0]![1]!;
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['X-Requested-With']).toBe('sd-web');
  });

  it('turns an error envelope into an ApiError with code and request id', async () => {
    respond(401, {
      error: { code: 'UNAUTHENTICATED', message: 'Invalid credentials', requestId: 'req-123' },
    });
    const err = (await api.login({ email: 'x@example.com' }).catch((e) => e)) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({
      status: 401,
      code: 'UNAUTHENTICATED',
      message: 'Invalid credentials',
      requestId: 'req-123',
    });
  });

  it('falls back to the header request id when the error body is not an envelope', async () => {
    respond(502, { oops: true }, { 'x-request-id': 'req-502' });
    await expect(apiRequest('/auth/demo-users', DemoUsersResponseSchema)).rejects.toMatchObject({
      status: 502,
      code: 'INTERNAL',
      requestId: 'req-502',
    });
  });

  it('rejects a response that does not match the shared schema', async () => {
    respond(200, { users: 'nope' });
    await expect(apiRequest('/auth/demo-users', DemoUsersResponseSchema)).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    });
  });

  it('reports a network failure as NETWORK', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new TypeError('fetch failed'));
    await expect(api.demoUsers()).rejects.toMatchObject({ status: 0, code: 'NETWORK' });
  });
});
