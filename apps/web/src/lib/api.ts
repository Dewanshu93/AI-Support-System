// Typed browser API client. Requests go to the same origin (/api/*), which
// Next.js rewrites to the Express API, so the session cookie is first-party.
// Every response is validated with the shared Zod schemas.
import {
  AuthUserResponseSchema,
  DemoUsersResponseSchema,
  ErrorEnvelopeSchema,
  type LoginRequest,
} from '@sd/shared';
import type { z } from 'zod';

export class ApiError extends Error {
  override name = 'ApiError';
  constructor(
    readonly status: number,
    /** Shared error code, or NETWORK / INVALID_RESPONSE for client-side failures. */
    readonly code: string,
    message: string,
    readonly requestId?: string,
  ) {
    super(message);
  }
}

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';

export async function apiRequest<S extends z.ZodType>(
  path: string,
  schema: S | null,
  { method = 'GET', body }: { method?: Method; body?: unknown } = {},
): Promise<z.output<S> | undefined> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        ...(body !== undefined && { 'Content-Type': 'application/json' }),
        // Marks requests from this app; the API checks it on mutations (W4-07).
        ...(method !== 'GET' && { 'X-Requested-With': 'sd-web' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'NETWORK', 'Cannot reach the service. Check your connection and retry.');
  }

  const requestId = res.headers.get('x-request-id') ?? undefined;
  if (!res.ok) {
    const envelope = ErrorEnvelopeSchema.safeParse(await res.json().catch(() => null));
    if (envelope.success) {
      const { code, message, requestId: id } = envelope.data.error;
      throw new ApiError(res.status, code, message, id);
    }
    throw new ApiError(res.status, 'INTERNAL', `Request failed (${res.status})`, requestId);
  }
  if (res.status === 204 || schema === null) return undefined;

  const parsed = schema.safeParse(await res.json().catch(() => undefined));
  if (!parsed.success) {
    throw new ApiError(
      res.status,
      'INVALID_RESPONSE',
      'Unexpected response from the server',
      requestId,
    );
  }
  return parsed.data;
}

/** Endpoint helpers used by the UI. */
export const api = {
  demoUsers: async () => (await apiRequest('/auth/demo-users', DemoUsersResponseSchema))!,
  login: async (body: LoginRequest) =>
    (await apiRequest('/auth/login', AuthUserResponseSchema, { method: 'POST', body }))!.user,
  logout: () => apiRequest('/auth/logout', null, { method: 'POST' }),
};
