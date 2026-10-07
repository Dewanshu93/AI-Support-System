// Typed browser API client. Requests go to the same origin (/api/*), which
// Next.js rewrites to the Express API, so the session cookie is first-party.
// Every response is validated with the shared Zod schemas.
import {
  AuthUserResponseSchema,
  ConversationDetailResponseSchema,
  ConversationListResponseSchema,
  ConversationResponseSchema,
  DemoUsersResponseSchema,
  ErrorEnvelopeSchema,
  type FeedbackRequest,
  FeedbackResponseSchema,
  type LoginRequest,
  SourceChunkResponseSchema,
  TicketConfirmResponseSchema,
  type TicketDraftConfirmRequest,
  TicketDetailResponseSchema,
  TicketListResponseSchema,
  type TicketStatus,
  DashboardResponseSchema,
  NotificationListResponseSchema,
  NotificationReadResponseSchema,
  PayslipListResponseSchema,
  PayslipResponseSchema,
  TaskListResponseSchema,
  type TimesheetSaveRequest,
  TimesheetSaveResponseSchema,
  TimesheetWeekResponseSchema,
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
    /** The envelope's `details` (e.g. the existing ticket of DUPLICATE_CANDIDATE). */
    readonly details?: unknown,
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
      const { code, message, requestId: id, details } = envelope.data.error;
      throw new ApiError(res.status, code, message, id, details);
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
  conversations: async (limit = 30) =>
    (await apiRequest(`/conversations?limit=${limit}`, ConversationListResponseSchema))!,
  createConversation: async () =>
    (await apiRequest('/conversations', ConversationResponseSchema, { method: 'POST', body: {} }))!
      .conversation,
  conversation: async (id: string) =>
    (await apiRequest(`/conversations/${id}`, ConversationDetailResponseSchema))!,
  resolve: async (id: string, messageId: string, resolved: boolean) =>
    (await apiRequest(`/conversations/${id}/resolution`, ConversationResponseSchema, {
      method: 'POST',
      body: { messageId, resolved },
    }))!.conversation,
  feedback: async (messageId: string, body: FeedbackRequest) =>
    (await apiRequest(`/messages/${messageId}/feedback`, FeedbackResponseSchema, {
      method: 'POST',
      body,
    }))!.feedback,
  source: async (chunkId: string) =>
    (await apiRequest(`/sources/chunks/${chunkId}`, SourceChunkResponseSchema))!,
  confirmDraft: async (conversationId: string, body: TicketDraftConfirmRequest) =>
    (await apiRequest(
      `/conversations/${conversationId}/ticket-draft/confirm`,
      TicketConfirmResponseSchema,
      {
        method: 'POST',
        body,
      },
    ))!.ticket,
  cancelDraft: async (conversationId: string) =>
    (await apiRequest(
      `/conversations/${conversationId}/ticket-draft/cancel`,
      ConversationResponseSchema,
      {
        method: 'POST',
        body: {},
      },
    ))!.conversation,
  myTickets: async ({ status, cursor }: { status?: TicketStatus; cursor?: string } = {}) => {
    const query = new URLSearchParams({ limit: '20' });
    if (status) query.set('status', status);
    if (cursor) query.set('cursor', cursor);
    return (await apiRequest(`/tickets/mine?${query}`, TicketListResponseSchema))!;
  },
  ticket: async (id: string) => (await apiRequest(`/tickets/${id}`, TicketDetailResponseSchema))!,

  // Employee workspace (UC-02).
  dashboard: async () => (await apiRequest('/dashboard', DashboardResponseSchema))!,
  myTasks: async (view: 'open' | 'all' = 'all') =>
    (await apiRequest(`/tasks/mine?view=${view}`, TaskListResponseSchema))!,
  timesheetWeek: async (date?: string) =>
    (await apiRequest(
      `/timesheets/week${date ? `?date=${date}` : ''}`,
      TimesheetWeekResponseSchema,
    ))!,
  saveTimesheet: async (body: TimesheetSaveRequest) =>
    (await apiRequest('/timesheets/entries', TimesheetSaveResponseSchema, {
      method: 'POST',
      body,
    }))!,
  payslips: async () => (await apiRequest('/payslips/mine', PayslipListResponseSchema))!,
  payslip: async (id: string) =>
    (await apiRequest(`/payslips/${id}`, PayslipResponseSchema))!.payslip,
  notifications: async (limit = 20) =>
    (await apiRequest(`/notifications?limit=${limit}`, NotificationListResponseSchema))!,
  markNotificationsRead: async (ids?: string[]) =>
    (await apiRequest('/notifications/read', NotificationReadResponseSchema, {
      method: 'POST',
      body: ids ? { ids } : {},
    }))!,
};
