import type { SupportGraph } from './ai/graph/graph';
import type { ConfigFiles } from './config/schemas';
import type { AuditRepository } from './modules/audit/repository';
import type { ConversationsRepository } from './modules/conversations/repository';
import type { SourcesReader } from './modules/documents/repository';
import type { UsersRepository } from './modules/users/repository';

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
}
