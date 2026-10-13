// Trace viewer (W4-03, playbook sections 4 and 10): admin only.
// GET /api/admin/conversations             filters + cursor; evaluation runs excluded
// GET /api/admin/conversations/:id/traces  timeline (audited admin.trace_view)
// GET /api/admin/traces/:traceId           full trace, chunk texts resolved (audited)
// User text is always the trace's redactedInput; raw messages are never returned.
import {
  type AdminConversation,
  type AdminConversationListQuery,
  AdminConversationListQuerySchema,
  type AdminConversationListResponse,
  API_BASE_PATH,
  type ConversationTracesResponse,
  ObjectIdStringSchema,
  type TraceCandidate,
  type TraceDetailResponse,
  type TraceSummary,
} from '@sd/shared';
import { z } from 'zod';
import type { ChunkDoc, ConversationDoc, TurnTraceDoc } from '../../db/schemas';
import type { AppDeps } from '../../deps';
import type { RouteDef } from '../../http/routes';
import { validate } from '../../http/validate';
import { AppError } from '../../lib/errors';
import { createAuditService } from '../audit/service';

const DAY_MS = 86_400_000;
const IdParams = z.object({ id: ObjectIdStringSchema });
const TraceParams = z.object({ traceId: ObjectIdStringSchema });

export function traceSummary(t: TurnTraceDoc): TraceSummary {
  return {
    decision: t.decision.value,
    reasonCode: t.decision.reasonCode,
    sensitiveHit: t.precheck.sensitiveHit,
    safetyHit: t.precheck.safetyHit,
    coverage: t.retrieval?.coverage ?? null,
    citationsValid: t.output.citationsValid.length,
    citationsRejected: t.output.citationsRejected.length,
    withdrawn: t.output.withdrawn,
    totalLatencyMs: t.totalLatencyMs,
    totalCostUsd: t.totalCostUsd,
    llmCallCount: t.llmCalls.length,
    errorCount: t.errors.length,
  };
}

function toConversationDto(c: ConversationDoc, userName: string): AdminConversation {
  return {
    id: c._id.toHexString(),
    userId: c.userId.toHexString(),
    userName,
    title: c.title,
    status: c.status,
    lastDecision: c.lastDecision,
    turnCount: c.turnCount,
    restricted: c.restricted,
    createdAt: c.createdAt.toISOString(),
  };
}

/** The trace with ids as strings and every retrieval candidate's chunk resolved. */
export function toTraceDetail(t: TurnTraceDoc, chunks: ChunkDoc[]): TraceDetailResponse['trace'] {
  const byId = new Map(chunks.map((c) => [c._id.toHexString(), c]));
  const resolve = (chunkId: string, score: number, rank?: number): TraceCandidate => {
    const chunk = byId.get(chunkId);
    return {
      chunkId,
      score,
      ...(rank !== undefined && { rank }),
      docTitle: chunk?.docTitle ?? null,
      sectionPath: chunk?.sectionPath ?? [],
      text: chunk?.text ?? null,
    };
  };
  const scored = (list: { chunkId: { toHexString(): string }; score: number; rank: number }[]) =>
    list.map((c) => resolve(c.chunkId.toHexString(), c.score, c.rank));
  return {
    id: t._id.toHexString(),
    messageId: t.messageId.toHexString(),
    conversationId: t.conversationId.toHexString(),
    userId: t.userId.toHexString(),
    graphRunId: t.graphRunId,
    redactedInput: t.redactedInput,
    profileSnapshot: t.profileSnapshot,
    precheck: t.precheck,
    analysis: t.analysis,
    retrieval: t.retrieval && {
      query: t.retrieval.query,
      filter: t.retrieval.filter,
      vector: scored(t.retrieval.vector),
      keyword: scored(t.retrieval.keyword),
      fused: scored(t.retrieval.fused),
      reranked: t.retrieval.reranked.map((r) => resolve(r.chunkId.toHexString(), r.relevance)),
      coverage: t.retrieval.coverage,
    },
    decision: t.decision,
    output: t.output,
    llmCalls: t.llmCalls,
    stepLatencyMs: t.stepLatencyMs,
    totalLatencyMs: t.totalLatencyMs,
    ttftMs: t.ttftMs,
    totalCostUsd: t.totalCostUsd,
    errors: t.errors,
    restricted: t.restricted,
    isEval: t.isEval,
    createdAt: t.createdAt.toISOString(),
  };
}

export function tracesRoutes(
  deps: Pick<AppDeps, 'traces' | 'users' | 'tickets' | 'audit'>,
): RouteDef[] {
  const audit = createAuditService(deps.audit);
  const userName = async (id: string) => (await deps.users.findById(id))?.name ?? 'Unknown user';

  return [
    {
      method: 'get',
      path: `${API_BASE_PATH}/admin/conversations`,
      access: ['admin'],
      handlers: [
        validate({ query: AdminConversationListQuerySchema }),
        async (req, res) => {
          const q = req.validated.query as AdminConversationListQuery;
          const page = await deps.traces.listConversations(
            {
              decision: q.decision,
              status: q.status,
              userId: q.userId,
              start: q.from ? new Date(`${q.from}T00:00:00Z`) : undefined,
              end: q.to ? new Date(Date.parse(`${q.to}T00:00:00Z`) + DAY_MS) : undefined,
            },
            { limit: q.limit, cursor: q.cursor },
          );
          const userIds = [...new Set(page.items.map((c) => c.userId.toHexString()))];
          const names = new Map(
            await Promise.all(userIds.map(async (id) => [id, await userName(id)] as const)),
          );
          const body: AdminConversationListResponse = {
            items: page.items.map((c) =>
              toConversationDto(c, names.get(c.userId.toHexString()) ?? 'Unknown user'),
            ),
            nextCursor: page.nextCursor,
          };
          res.json(body);
        },
      ],
    },
    {
      method: 'get',
      path: `${API_BASE_PATH}/admin/conversations/:id/traces`,
      access: ['admin'],
      handlers: [
        validate({ params: IdParams }),
        async (req, res) => {
          const { id } = req.validated.params as z.infer<typeof IdParams>;
          const conversation = await deps.traces.findConversation(id);
          if (!conversation) throw new AppError('NOT_FOUND', 'Conversation not found');
          const [traces, name, ticket] = await Promise.all([
            deps.traces.listTraces(conversation._id),
            userName(conversation.userId.toHexString()),
            conversation.ticketId
              ? deps.tickets.findById(conversation.ticketId.toHexString())
              : Promise.resolve(null),
          ]);
          const messages = await deps.traces.findMessages(traces.map((t) => t.messageId));
          const content = new Map(messages.map((m) => [m._id.toHexString(), m.content]));
          await audit.record(req, {
            action: 'admin.trace_view',
            targetType: 'conversation',
            targetId: id,
            metadata: { restricted: conversation.restricted, turns: traces.length },
          });
          const body: ConversationTracesResponse = {
            conversation: {
              ...toConversationDto(conversation, name),
              ticket: ticket && {
                id: ticket._id.toHexString(),
                humanId: ticket.humanId,
                queue: ticket.queue,
                priority: ticket.priority,
                aiUrgency: ticket.aiUrgency,
                priorityFloorApplied: ticket.priorityFloorApplied,
              },
            },
            turns: traces.map((t) => ({
              traceId: t._id.toHexString(),
              messageId: t.messageId.toHexString(),
              createdAt: t.createdAt.toISOString(),
              userMessage: t.redactedInput,
              assistantMessage: content.get(t.messageId.toHexString()) ?? '',
              traceSummary: traceSummary(t),
            })),
          };
          res.json(body);
        },
      ],
    },
    {
      method: 'get',
      path: `${API_BASE_PATH}/admin/traces/:traceId`,
      access: ['admin'],
      handlers: [
        validate({ params: TraceParams }),
        async (req, res) => {
          const { traceId } = req.validated.params as z.infer<typeof TraceParams>;
          const trace = await deps.traces.findTrace(traceId);
          if (!trace) throw new AppError('NOT_FOUND', 'Trace not found');
          const r = trace.retrieval;
          const chunkIds = r
            ? [
                ...new Set(
                  [...r.vector, ...r.keyword, ...r.fused, ...r.reranked].map((c) =>
                    c.chunkId.toHexString(),
                  ),
                ),
              ]
            : [];
          const chunks = await deps.traces.findChunks(chunkIds);
          await audit.record(req, {
            action: 'admin.trace_view',
            targetType: 'trace',
            targetId: traceId,
            metadata: {
              conversationId: trace.conversationId.toHexString(),
              restricted: trace.restricted,
            },
          });
          const body: TraceDetailResponse = { trace: toTraceDetail(trace, chunks) };
          res.json(body);
        },
      ],
    },
  ];
}
