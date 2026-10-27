// Typed browser API client. Requests go to the same origin (/api/*), which
// Next.js rewrites to the Express API, so the session cookie is first-party.
// Every response is validated with the shared Zod schemas.
import {
  EvalResultsResponseSchema,
  EvalRunDetailResponseSchema,
  EvalRunListResponseSchema,
  type EvalRunStartRequest,
  EvalRunStartResponseSchema,
  AdminDocumentDetailResponseSchema,
  type AdminDocumentListQuery,
  AdminDocumentListResponseSchema,
  AdminDocumentResponseSchema,
  type DocumentStatus,
  type DocumentUploadMetadata,
  type AdminConversationListQuery,
  AdminConversationListResponseSchema,
  AdminFeedbackListResponseSchema,
  ConversationTracesResponseSchema,
  TraceDetailResponseSchema,
  type AgentClassificationRequest,
  AgentDraftReplyResponseSchema,
  AgentEventResponseSchema,
  AgentTicketDetailResponseSchema,
  type AgentTicketListQuery,
  AgentTicketListResponseSchema,
  AgentTicketResponseSchema,
  AuthUserResponseSchema,
  MetricsOverviewResponseSchema,
  KnowledgeGapsRefreshResponseSchema,
  KnowledgeGapsResponseSchema,
  ConversationDetailResponseSchema,
  ConversationListResponseSchema,
  ConversationResponseSchema,
  DemoUsersResponseSchema,
  ErrorEnvelopeSchema,
  type FeedbackRequest,
  FeedbackResponseSchema,
  type LoginRequest,
  type PreferencesRequest,
  SourceChunkResponseSchema,
  TicketConfirmResponseSchema,
  type TicketDraftConfirmRequest,
  TicketDetailResponseSchema,
  TicketListResponseSchema,
  type TicketStatus,
  ActionConfirmResponseSchema,
  DashboardResponseSchema,
  NotificationListResponseSchema,
  NotificationReadResponseSchema,
  PayslipListResponseSchema,
  PayslipResponseSchema,
  TaskListResponseSchema,
  IntegrationListResponseSchema,
  type TimesheetSaveRequest,
  TimesheetSaveResponseSchema,
  TimesheetWeekResponseSchema,
  type AgentLeaveDecisionRequest,
  AgentLeaveDecisionResponseSchema,
  AgentLeaveListResponseSchema,
  type LeaveApplyRequest,
  LeaveApplyResponseSchema,
  LeaveOverviewResponseSchema,
  type LeaveStatus,
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

/** Upload metadata as the form sends it (dates as YYYY-MM-DD strings). */
export type DocumentUploadMetadataInput = Omit<DocumentUploadMetadata, 'effectiveDate'> & {
  effectiveDate: string;
};

export async function apiRequest<S extends z.ZodType>(
  path: string,
  schema: S | null,
  { method = 'GET', body }: { method?: Method; body?: unknown } = {},
): Promise<z.output<S> | undefined> {
  let res: Response;
  // Multipart uploads (W4-04) go as is: the browser sets the boundary header.
  const multipart = typeof FormData !== 'undefined' && body instanceof FormData;
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        ...(body !== undefined && !multipart && { 'Content-Type': 'application/json' }),
        // Marks requests from this app; the API checks it on mutations (W4-07).
        ...(method !== 'GET' && { 'X-Requested-With': 'sd-web' }),
      },
      body: body === undefined ? undefined : multipart ? body : JSON.stringify(body),
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
  me: async () => (await apiRequest('/auth/me', AuthUserResponseSchema))!.user,

  // Admin (W4-01).
  metricsOverview: async (q: { from?: string; to?: string } = {}) => {
    const params = new URLSearchParams();
    if (q.from) params.set('from', q.from);
    if (q.to) params.set('to', q.to);
    const query = params.toString();
    return (await apiRequest(
      `/admin/metrics/overview${query ? `?${query}` : ''}`,
      MetricsOverviewResponseSchema,
    ))!;
  },

  // Knowledge gaps (W4-02).
  knowledgeGaps: async () =>
    (await apiRequest('/admin/knowledge-gaps?snapshot=latest', KnowledgeGapsResponseSchema))!,
  // UC-16: rated answers with their trace.
  adminFeedback: async (rating: 'up' | 'down' = 'down') =>
    (await apiRequest(`/admin/feedback?rating=${rating}`, AdminFeedbackListResponseSchema))!,
  refreshKnowledgeGaps: async (body: { from?: string; to?: string } = {}) =>
    (await apiRequest('/admin/knowledge-gaps/refresh', KnowledgeGapsRefreshResponseSchema, {
      method: 'POST',
      body,
    }))!.refresh,

  // Trace viewer (W4-03).
  adminConversations: async (q: Partial<AdminConversationListQuery> = {}) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(q)) if (value) params.set(key, String(value));
    const query = params.toString();
    return (await apiRequest(
      `/admin/conversations${query ? `?${query}` : ''}`,
      AdminConversationListResponseSchema,
    ))!;
  },
  conversationTraces: async (id: string) =>
    (await apiRequest(
      `/admin/conversations/${encodeURIComponent(id)}/traces`,
      ConversationTracesResponseSchema,
    ))!,
  trace: async (traceId: string) =>
    (await apiRequest(`/admin/traces/${encodeURIComponent(traceId)}`, TraceDetailResponseSchema))!
      .trace,

  // Documents (W4-04).
  adminDocuments: async (q: Partial<AdminDocumentListQuery> = {}) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(q)) if (value) params.set(key, String(value));
    const query = params.toString();
    return (await apiRequest(
      `/admin/documents${query ? `?${query}` : ''}`,
      AdminDocumentListResponseSchema,
    ))!.items;
  },
  adminDocument: async (id: string) =>
    (await apiRequest(
      `/admin/documents/${encodeURIComponent(id)}`,
      AdminDocumentDetailResponseSchema,
    ))!,
  uploadDocument: async (file: File, metadata: DocumentUploadMetadataInput) => {
    const form = new FormData();
    form.set('metadata', JSON.stringify(metadata));
    form.set('file', file);
    return (await apiRequest('/admin/documents', AdminDocumentResponseSchema, {
      method: 'POST',
      body: form,
    }))!.document;
  },
  reindexDocument: async (id: string) =>
    (await apiRequest(
      `/admin/documents/${encodeURIComponent(id)}/reindex`,
      AdminDocumentResponseSchema,
      { method: 'POST' },
    ))!.document,
  setDocumentStatus: async (id: string, status: DocumentStatus) =>
    (await apiRequest(
      `/admin/documents/${encodeURIComponent(id)}/status`,
      AdminDocumentResponseSchema,
      { method: 'PATCH', body: { status } },
    ))!.document,

  // Evaluation (W4-05).
  evalRuns: async (q: { limit?: number; cursor?: string } = {}) => {
    const params = new URLSearchParams();
    if (q.limit) params.set('limit', String(q.limit));
    if (q.cursor) params.set('cursor', q.cursor);
    const query = params.toString();
    return (await apiRequest(
      `/admin/evals/runs${query ? `?${query}` : ''}`,
      EvalRunListResponseSchema,
    ))!;
  },
  evalRun: async (id: string) =>
    (await apiRequest(`/admin/evals/runs/${encodeURIComponent(id)}`, EvalRunDetailResponseSchema))!
      .run,
  evalResults: async (
    id: string,
    q: { passed?: boolean; category?: string; limit?: number; cursor?: string } = {},
  ) => {
    const params = new URLSearchParams();
    if (q.passed !== undefined) params.set('passed', String(q.passed));
    if (q.category) params.set('category', q.category);
    params.set('limit', String(q.limit ?? 100));
    if (q.cursor) params.set('cursor', q.cursor);
    return (await apiRequest(
      `/admin/evals/runs/${encodeURIComponent(id)}/results?${params}`,
      EvalResultsResponseSchema,
    ))!;
  },
  startEvalRun: async (body: EvalRunStartRequest) =>
    (await apiRequest('/admin/evals/runs', EvalRunStartResponseSchema, { method: 'POST', body }))!
      .runId,

  // Agent workspace (W3-07).
  agentQueue: async (q: Partial<AgentTicketListQuery> = {}) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(q)) if (value) params.set(key, String(value));
    const query = params.toString();
    return (await apiRequest(
      `/agent/tickets${query ? `?${query}` : ''}`,
      AgentTicketListResponseSchema,
    ))!;
  },
  agentTicket: async (id: string) =>
    (await apiRequest(`/agent/tickets/${id}`, AgentTicketDetailResponseSchema))!,
  agentReply: async (id: string, body: string, usedAiDraft: boolean) =>
    (await apiRequest(`/agent/tickets/${id}/replies`, AgentEventResponseSchema, {
      method: 'POST',
      body: { body, usedAiDraft },
    }))!.event,
  agentNote: async (id: string, body: string) =>
    (await apiRequest(`/agent/tickets/${id}/notes`, AgentEventResponseSchema, {
      method: 'POST',
      body: { body },
    }))!.event,
  agentStatus: async (id: string, status: TicketStatus) =>
    (await apiRequest(`/agent/tickets/${id}/status`, AgentTicketResponseSchema, {
      method: 'PATCH',
      body: { status },
    }))!.ticket,
  agentClassify: async (id: string, body: AgentClassificationRequest) =>
    (await apiRequest(`/agent/tickets/${id}/classification`, AgentTicketResponseSchema, {
      method: 'PATCH',
      body,
    }))!.ticket,
  agentDraftReply: async (id: string, tone: 'standard' | 'brief') =>
    (await apiRequest(`/agent/tickets/${id}/draft-reply`, AgentDraftReplyResponseSchema, {
      method: 'POST',
      body: { tone },
    }))!,
  /** The signed-in user's own settings (ADR-020: Pro models). */
  setPreferences: async (body: PreferencesRequest) =>
    (await apiRequest('/profiles/me/preferences', AuthUserResponseSchema, {
      method: 'PATCH',
      body,
    }))!.user,
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
  confirmAction: async (conversationId: string) =>
    (await apiRequest(
      `/conversations/${conversationId}/action/confirm`,
      ActionConfirmResponseSchema,
      {
        method: 'POST',
        body: {},
      },
    ))!.result,
  cancelAction: async (conversationId: string) =>
    (await apiRequest(
      `/conversations/${conversationId}/action/cancel`,
      ConversationResponseSchema,
      {
        method: 'POST',
        body: {},
      },
    ))!.conversation,
  ticket: async (id: string) => (await apiRequest(`/tickets/${id}`, TicketDetailResponseSchema))!,
  // The requester's own changes (UC-17).
  commentRequest: async (id: string, body: string) =>
    (await apiRequest(`/tickets/${id}/comment`, TicketDetailResponseSchema, {
      method: 'POST',
      body: { body },
    }))!,
  withdrawRequest: async (id: string, reason?: string) =>
    (await apiRequest(`/tickets/${id}/withdraw`, TicketDetailResponseSchema, {
      method: 'POST',
      body: reason ? { reason } : {},
    }))!,
  reopenRequest: async (id: string, reason?: string) =>
    (await apiRequest(`/tickets/${id}/reopen`, TicketDetailResponseSchema, {
      method: 'POST',
      body: reason ? { reason } : {},
    }))!,

  // Employee workspace (UC-02).
  dashboard: async () => (await apiRequest('/dashboard', DashboardResponseSchema))!,
  myTasks: async (view: 'open' | 'all' = 'all') =>
    (await apiRequest(`/tasks/mine?view=${view}`, TaskListResponseSchema))!,
  // Connected tools (UC-18): connecting is a browser navigation to /api/integrations/jira/connect.
  integrations: async () => (await apiRequest('/integrations', IntegrationListResponseSchema))!,
  disconnectJira: async () =>
    (await apiRequest('/integrations/jira/disconnect', IntegrationListResponseSchema, {
      method: 'POST',
    }))!,
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

  // Leave (UC-11).
  leave: async () => (await apiRequest('/leave', LeaveOverviewResponseSchema))!,
  applyLeave: async (body: LeaveApplyRequest) =>
    (await apiRequest('/leave/requests', LeaveApplyResponseSchema, { method: 'POST', body }))!,
  cancelLeave: async (id: string) =>
    (await apiRequest(`/leave/requests/${id}/cancel`, LeaveOverviewResponseSchema, {
      method: 'POST',
      body: {},
    }))!,
  agentLeave: async (status: LeaveStatus = 'pending') =>
    (await apiRequest(`/agent/leave?status=${status}`, AgentLeaveListResponseSchema))!,
  decideLeave: async (id: string, body: AgentLeaveDecisionRequest) =>
    (await apiRequest(`/agent/leave/${id}/decision`, AgentLeaveDecisionResponseSchema, {
      method: 'POST',
      body,
    }))!.request,
};
