import type { AuditRepository } from './modules/audit/repository';
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
}
