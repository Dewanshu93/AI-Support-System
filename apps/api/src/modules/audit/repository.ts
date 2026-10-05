import type { Collection } from 'mongodb';
import { validateForWrite } from '../../db/collections';
import { type AuditLogDoc, AuditLogSchema } from '../../db/schemas';

/** Append-only: there is deliberately no update or delete. */
export interface AuditRepository {
  insert(entry: AuditLogDoc): Promise<void>;
}

export function mongoAuditRepository(auditLog: Collection<AuditLogDoc>): AuditRepository {
  return {
    async insert(entry) {
      await auditLog.insertOne(validateForWrite('audit_log', AuditLogSchema, entry));
    },
  };
}
