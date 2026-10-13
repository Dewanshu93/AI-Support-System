// Knowledge gaps storage (W4-02): reads the candidate turns from turn_traces and
// keeps one snapshot in gap_clusters (a refresh replaces it). Which turns count
// is decided in domain/gapClustering.ts (isGapCandidate); the query narrows the
// read and the service applies the rule again.
import type { Collection } from 'mongodb';
import type { GapClusterDoc, TurnTraceDoc } from '../../db/schemas';

export interface GapCandidate {
  messageId: string;
  conversationId: string;
  /** The redacted user question. */
  text: string;
  decision: string;
  reasonCode: string;
  restricted: boolean;
  isEval: boolean;
}

export interface GapsRepository {
  loadCandidates(range: { start: Date; end: Date }): Promise<GapCandidate[]>;
  /** Replaces the stored snapshot with these clusters (possibly none). */
  replaceSnapshot(clusters: GapClusterDoc[]): Promise<void>;
  latestSnapshot(): Promise<GapClusterDoc[]>;
}

export function mongoGapsRepository(c: {
  turnTraces: Collection<TurnTraceDoc>;
  gapClusters: Collection<GapClusterDoc>;
}): GapsRepository {
  return {
    async loadCandidates({ start, end }) {
      const rows = await c.turnTraces
        .find(
          {
            isEval: false,
            restricted: false,
            createdAt: { $gte: start, $lt: end },
            $or: [
              { 'decision.value': 'PARTIAL' },
              { 'decision.value': 'ESCALATE', 'decision.reasonCode': 'NO_EVIDENCE' },
            ],
          },
          {
            projection: {
              messageId: 1,
              conversationId: 1,
              redactedInput: 1,
              decision: 1,
              restricted: 1,
              isEval: 1,
            },
            sort: { createdAt: 1 },
          },
        )
        .toArray();
      return rows.map((t) => ({
        messageId: t.messageId.toHexString(),
        conversationId: t.conversationId.toHexString(),
        text: t.redactedInput,
        decision: t.decision.value,
        reasonCode: t.decision.reasonCode,
        restricted: t.restricted,
        isEval: t.isEval,
      }));
    },

    async replaceSnapshot(clusters) {
      // Insert first, then drop older snapshots: a failure leaves the old one readable.
      if (clusters.length > 0) await c.gapClusters.insertMany(clusters);
      const keep = clusters[0]?.snapshotAt;
      await c.gapClusters.deleteMany(keep ? { snapshotAt: { $ne: keep } } : {});
    },

    async latestSnapshot() {
      const latest = await c.gapClusters.findOne({}, { sort: { snapshotAt: -1 } });
      if (!latest) return [];
      return c.gapClusters
        .find({ snapshotAt: latest.snapshotAt })
        .sort({ questionCount: -1 })
        .toArray();
    },
  };
}
