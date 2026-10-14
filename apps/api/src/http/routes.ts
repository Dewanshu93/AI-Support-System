// Route policy table (playbook section 9, RBAC). Every endpoint is declared
// here with an explicit access rule; mountRoutes applies requireAuth and
// requireRole from that rule, so a route cannot exist without a policy.
import type { Role } from '@sd/shared';
import type { Express, RequestHandler } from 'express';
import type { AppDeps } from '../deps';
import { runWithModelMode } from '../ai/llm/modelMode';
import { AppError } from '../lib/errors';
import { createDraftReplyService } from '../modules/agent/draftReply';
import { agentRoutes } from '../modules/agent/routes';
import { gapsRoutes } from '../modules/gaps/routes';
import { tracesRoutes } from '../modules/traces/routes';
import { documentAdminRoutes } from '../modules/documents/adminRoutes';
import { evalsRoutes } from '../modules/evals/routes';
import { metricsRoutes } from '../modules/metrics/routes';
import { createAgentService } from '../modules/agent/service';
import { authRoutes } from '../modules/auth/routes';
import { chatRoutes } from '../modules/chat/routes';
import { createTurnRunner } from '../modules/chat/turnRunner';
import { conversationRoutes } from '../modules/conversations/routes';
import { createConversationService } from '../modules/conversations/service';
import { sourceRoutes } from '../modules/documents/routes';
import { ticketRoutes } from '../modules/tickets/routes';
import { createTicketService } from '../modules/tickets/service';
import { healthRoutes } from '../modules/health/routes';
import { profileRoutes } from '../modules/users/routes';
import { actionRoutes } from '../modules/workspace/actionRoutes';
import { createActionService } from '../modules/workspace/actionService';
import { workspaceRoutes } from '../modules/workspace/routes';
import { createWorkspaceService } from '../modules/workspace/service';
import { requireAuth } from './requireAuth';
import { requireRole } from './requireRole';
import type { RateLimitName } from './security';

/** `public`: no session; `any`: any authenticated role; otherwise the allowed roles. */
export type Access = 'public' | 'any' | readonly [Role, ...Role[]];

export interface RouteDef {
  method: 'get' | 'post' | 'patch' | 'delete';
  path: string;
  access: Access;
  /** Validation, controller, … — run after the access guards. */
  handlers: RequestHandler[];
  /** In-memory rate limit (W4-07): per user, or per IP on public routes. */
  rateLimit?: RateLimitName;
}

/** The full route table: every module contributes its routes here. */
export function buildRoutes(deps: AppDeps): RouteDef[] {
  const conversations = createConversationService({
    conversations: deps.conversations,
    resolutionDeclinedText: deps.templates.resolution_declined,
  });
  // One runner per app: it holds the per-conversation turn locks.
  const runner = createTurnRunner({
    graph: deps.chat.graph,
    conversations: deps.conversations,
    genericErrorText: deps.templates.generic_error,
  });
  const agentService = createAgentService({
    tickets: deps.tickets,
    agentTickets: deps.agentTickets,
    notifications: deps.workspace,
    taxonomy: deps.ticketConfig.taxonomy,
    routing: deps.ticketConfig.routing,
  });
  return [
    ...healthRoutes(deps),
    ...authRoutes(deps),
    ...profileRoutes(deps),
    ...conversationRoutes(deps, conversations),
    ...chatRoutes(conversations, runner),
    ...sourceRoutes(deps),
    ...ticketRoutes(
      deps,
      createTicketService({
        graph: deps.chat.graph,
        tickets: deps.tickets,
        email: deps.email,
        conversations: deps.conversations,
        getOwned: conversations.getOwned,
        exclusive: runner.exclusive,
        ticketSchemas: deps.ticketConfig.ticketSchemas,
        templates: deps.templates,
        duplicateWindowDays: deps.ticketConfig.duplicateWindowDays,
      }),
    ),
    ...agentRoutes(
      deps,
      agentService,
      createDraftReplyService({
        agent: agentService,
        tickets: deps.tickets,
        conversations: deps.conversations,
        sources: deps.sources,
        draft:
          deps.agentDraft ??
          (() => {
            throw new AppError('LLM_UNAVAILABLE', 'AI drafts are not configured');
          }),
      }),
    ),
    ...metricsRoutes(deps),
    ...gapsRoutes(deps),
    ...tracesRoutes(deps),
    ...documentAdminRoutes(deps),
    ...evalsRoutes(deps),
    ...workspaceRoutes(
      deps,
      createWorkspaceService({
        workspace: deps.workspace,
        tickets: deps.tickets,
        workday: deps.workday,
        routing: deps.ticketConfig.routing,
        clock: deps.clock ?? (() => new Date()),
      }),
    ),
    ...actionRoutes(
      deps,
      createActionService({
        graph: deps.chat.graph,
        conversations: deps.conversations,
        getOwned: conversations.getOwned,
        exclusive: runner.exclusive,
      }),
    ),
  ];
}

/**
 * Runs the rest of the request in the signed-in user's model mode (ADR-020): any
 * LLM call made for them uses paid models only with Pro on, otherwise the local model.
 */
export const withModelMode: RequestHandler = (req, _res, next) =>
  runWithModelMode(req.user?.proModels ? 'pro' : 'local', next);

export function mountRoutes(
  app: Express,
  routes: RouteDef[],
  deps: AppDeps,
  limiters?: Record<RateLimitName, RequestHandler>,
): void {
  const authenticate = requireAuth({ users: deps.users, jwtSecret: deps.auth.jwtSecret });
  for (const route of routes) {
    const limit = route.rateLimit && limiters ? [limiters[route.rateLimit]] : [];
    const guards =
      route.access === 'public'
        ? limit
        : route.access === 'any'
          ? [authenticate, ...limit, withModelMode]
          : [authenticate, requireRole(...route.access), ...limit, withModelMode];
    app[route.method](route.path, ...guards, ...route.handlers);
  }
}
