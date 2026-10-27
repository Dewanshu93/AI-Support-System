import type { SupportGraph } from './ai/graph/graph';
import type { DraftReplyFn } from './ai/nodes/draftReply';
import type { ConfigFiles } from './config/schemas';
import type { RateLimitConfig } from './http/security';
import type { AgentTicketsRepository } from './modules/agent/repository';
import type { AuditRepository } from './modules/audit/repository';
import type { ConversationsRepository } from './modules/conversations/repository';
import type { SourcesReader } from './modules/documents/repository';
import type { EmailService } from './modules/email/service';
import type { GapsRepository } from './modules/gaps/repository';
import type { GapsService } from './modules/gaps/service';
import type { IntegrationsRepository } from './modules/integrations/repository';
import type { IntegrationClients } from './modules/integrations/service';
import type { TokenCipher } from './modules/integrations/tokenCrypto';
import type { MetricsRepository } from './modules/metrics/repository';
import type { TicketsRepository } from './modules/tickets/repository';
import type { TracesRepository } from './modules/traces/repository';
import type { DocumentAdmin } from './modules/documents/admin';
import type { EvalsRepository } from './modules/evals/repository';
import type { EvalsService } from './modules/evals/service';
import type { UsersRepository } from './modules/users/repository';
import type { WorkspaceRepository } from './modules/workspace/repository';

/**
 * Everything route handlers need, injected at startup (server.ts) or by tests
 * (in-memory repositories). Modules never construct their own I/O.
 */
export interface AppDeps {
  users: UsersRepository;
  audit: AuditRepository;
  auth: {
    jwtSecret: string;
    /** When set, login also requires this shared demo password. */
    demoPassword?: string;
    /** Secure cookie flag; true outside local development. */
    secureCookies: boolean;
  };
  /** True when the configured chat provider and Gemini embeddings both have keys. */
  llmConfigured?: boolean;
  /** Health probes; omitted fields are left out of GET /api/health. */
  pingDb?: () => Promise<boolean>;
  pingVectorStore?: () => Promise<boolean>;
  conversations: ConversationsRepository;
  /** Cited chunks for the source viewer. */
  sources: SourcesReader;
  /** The compiled turn graph (ai/graph/runtime.ts) with its checkpointer. */
  chat: { graph: SupportGraph };
  /** config/templates.yaml: fixed replies used by the API (errors, resolution). */
  templates: ConfigFiles['templates']['templates'];
  tickets: TicketsRepository;
  /** Escalation email outbox (UC-07, ADR-017): written by the graph, read by the ticket views. */
  email: Pick<EmailService, 'findByConversation' | 'listForTicket'>;
  /** Agent queue queries, guarded updates and the override rate (W3-05). */
  agentTickets: AgentTicketsRepository;
  /** P-7 draft reply for agents (W3-06); without it the endpoint answers 503. */
  agentDraft?: DraftReplyFn;
  /** Config the ticket endpoints need (routing, taxonomy, field schemas, duplicate window). */
  ticketConfig: {
    routing: ConfigFiles['routing'];
    taxonomy: ConfigFiles['taxonomy'];
    ticketSchemas: ConfigFiles['ticketSchemas']['schemas'];
    duplicateWindowDays: number;
  };
  /**
   * Connected apps (UC-18, UC-19): encrypted tokens, the cipher, and a client for each
   * tool the server has credentials for (a tool without one is not offered).
   */
  integrations: {
    repository: IntegrationsRepository;
    cipher?: TokenCipher;
    clients: IntegrationClients;
  };
  /** Mock task tracker, timesheets, HR/payroll records and notifications (UC-01). */
  workspace: WorkspaceRepository;
  /** Rows for the admin overview metrics (W4-01). */
  metrics: MetricsRepository;
  /** Knowledge-gap snapshot and background refresh (W4-02). */
  gaps: { repository: GapsRepository; service: GapsService };
  /** Admin reads for the trace viewer (W4-03). */
  traces: TracesRepository;
  /** Admin document management (W4-04): upload, re-index, status. */
  documentAdmin: DocumentAdmin;
  /** Eval runs from the admin UI (W4-05). */
  evals: { repository: EvalsRepository; service: EvalsService };
  /** config/workday.yaml: timesheet rules and holiday calendar. */
  workday: ConfigFiles['workday'];
  /** HTTP hardening (W4-07): CORS origin and in-memory rate limits. */
  security: { webOrigin: string; rateLimits: RateLimitConfig };
  /** Current time; injected so tests and demos control "today". Defaults to the system clock. */
  clock?: () => Date;
}
