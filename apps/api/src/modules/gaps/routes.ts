// Knowledge gaps (W4-02, playbook section 4): admin only.
// GET  /api/admin/knowledge-gaps?snapshot=latest  → the stored snapshot + refresh state
// POST /api/admin/knowledge-gaps/refresh {from?,to?} → 202, refresh runs in the background
import {
  API_BASE_PATH,
  type GapClusterDto,
  KnowledgeGapsQuerySchema,
  type KnowledgeGapsRefreshRequest,
  KnowledgeGapsRefreshRequestSchema,
  type KnowledgeGapsRefreshResponse,
  type KnowledgeGapsResponse,
} from '@sd/shared';
import type { AppDeps } from '../../deps';
import type { GapClusterDoc } from '../../db/schemas';
import { overviewRange } from '../../domain/metrics';
import type { RouteDef } from '../../http/routes';
import { validate } from '../../http/validate';
import { createAuditService } from '../audit/service';
import type { GapRefreshState } from './service';

function toClusterDto(c: GapClusterDoc): GapClusterDto {
  return {
    id: c._id.toHexString(),
    label: c.label,
    labelled: c.labelled,
    domain: c.domain,
    questionCount: c.questionCount,
    examples: c.exampleQuestions.map((question, i) => ({
      question,
      messageId: c.messageIds[i]!.toHexString(),
      conversationId: c.conversationIds[i]!.toHexString(),
    })),
  };
}

function toStateDto(s: GapRefreshState): KnowledgeGapsResponse['refresh'] {
  return { status: s.status, startedAt: s.startedAt?.toISOString() ?? null, error: s.error };
}

export function gapsRoutes(deps: Pick<AppDeps, 'gaps' | 'audit' | 'clock'>): RouteDef[] {
  const now = deps.clock ?? (() => new Date());
  const audit = createAuditService(deps.audit);
  const base = `${API_BASE_PATH}/admin/knowledge-gaps`;
  return [
    {
      method: 'get',
      path: base,
      access: ['admin'],
      handlers: [
        validate({ query: KnowledgeGapsQuerySchema }),
        async (_req, res) => {
          const clusters = await deps.gaps.repository.latestSnapshot();
          const first = clusters[0];
          const body: KnowledgeGapsResponse = {
            snapshot: first
              ? {
                  snapshotAt: first.snapshotAt.toISOString(),
                  range: { from: first.rangeFrom, to: first.rangeTo },
                  clusters: clusters.map(toClusterDto),
                }
              : null,
            refresh: toStateDto(deps.gaps.service.state()),
          };
          res.json(body);
        },
      ],
    },
    {
      method: 'post',
      path: `${base}/refresh`,
      access: ['admin'],
      handlers: [
        validate({ body: KnowledgeGapsRefreshRequestSchema }),
        async (req, res) => {
          const body = req.validated.body as KnowledgeGapsRefreshRequest;
          const range = overviewRange(
            body,
            now().toISOString().slice(0, 10),
            deps.gaps.service.defaultRangeDays,
          );
          const state = deps.gaps.service.refresh(range);
          await audit.record(req, {
            action: 'admin.gaps_refresh',
            targetType: 'gap_clusters',
            metadata: { from: range.from, to: range.to },
          });
          const response: KnowledgeGapsRefreshResponse = { refresh: toStateDto(state) };
          res.status(202).json(response);
        },
      ],
    },
  ];
}
