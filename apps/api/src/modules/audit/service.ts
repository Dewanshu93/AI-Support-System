import type { AuthUser } from '@sd/shared';
import type { Request } from 'express';
import { ObjectId } from 'mongodb';
import type { AuditRepository } from './repository';

export interface AuditEvent {
  /** `<area>.<verb>`, e.g. auth.login, ticket.status_change, admin.trace_view. */
  action: string;
  /** Defaults to the authenticated user on the request. */
  actor?: AuthUser | null;
  targetType?: string;
  targetId?: string;
  /** IDs and codes only, never PII or message content. */
  metadata?: Record<string, unknown>;
}

export interface AuditService {
  record(req: Request, event: AuditEvent): Promise<void>;
}

export function createAuditService(repo: AuditRepository): AuditService {
  return {
    async record(req, event) {
      const actor = event.actor === undefined ? req.user : event.actor;
      await repo.insert({
        _id: new ObjectId(),
        actorId: actor ? new ObjectId(actor.id) : null,
        actorRole: actor?.role ?? null,
        action: event.action,
        targetType: event.targetType ?? null,
        targetId: event.targetId ?? null,
        metadata: event.metadata ?? {},
        ip: req.ip ?? '',
        requestId: req.id,
        createdAt: new Date(),
      });
    },
  };
}
