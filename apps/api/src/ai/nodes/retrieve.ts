// retrieve (code + embeddings; playbook section 7 steps 1–6). Profile-safe
// hybrid search for the analysis' standalone query. An embedding failure
// degrades to keyword-only (flagged); a DB failure propagates (error event).
import type { Domain } from '@sd/shared';
import type { RetrievalCandidate, RetrievalResult } from '../retrieval/retrieve';
import type { AccessProfile } from '../retrieval/accessRules';
import type { SourceChunk, State, StateUpdate } from '../graph/state';

export const RETRIEVAL_KEYWORD_ONLY = 'RETRIEVAL_KEYWORD_ONLY';
export const DOMAIN_HINT_DROPPED = 'DOMAIN_HINT_DROPPED';
export const ACCESS_FILTER_VIOLATION = 'ACCESS_FILTER_VIOLATION';

export interface RetrieveNodeDeps {
  retrieve(input: {
    query: string;
    profile: AccessProfile;
    domainHint?: Domain;
  }): Promise<RetrievalResult>;
}

export function toSourceChunk(candidate: RetrievalCandidate): SourceChunk {
  const { chunk } = candidate;
  return {
    chunkId: chunk._id.toHexString(),
    documentId: chunk.documentId.toHexString(),
    docSlug: chunk.docSlug,
    docTitle: chunk.docTitle,
    sectionPath: chunk.sectionPath,
    effectiveDate: chunk.effectiveDate.toISOString(),
    text: chunk.text,
    fusedScore: candidate.fusedScore,
    rank: candidate.rank,
  };
}

/** The domain narrows the search only when the analysis is confident about it. */
export function domainHint(state: State): Domain | undefined {
  const a = state.analysis;
  return a && a.domain !== 'unknown' && a.ambiguity === 'low' ? a.domain : undefined;
}

export function createRetrieve(deps: RetrieveNodeDeps) {
  return async function retrieve(state: State): Promise<StateUpdate> {
    if (!state.profile) throw new Error('retrieve: profile not loaded');
    // An agent may widen the query for this turn (payroll: terms from the records).
    const query = state.retrievalQuery ?? state.analysis?.searchQuery ?? state.input.text;
    const { candidates, trace } = await deps.retrieve({
      query,
      profile: state.profile,
      domainHint: domainHint(state),
    });
    const sources = candidates.map(toSourceChunk);
    const flags: string[] = [];
    if (trace.embeddingError) flags.push(RETRIEVAL_KEYWORD_ONLY);
    if (trace.domainHintDropped) flags.push(DOMAIN_HINT_DROPPED);
    const errors = [
      ...trace.violations.map((v) => ({
        node: 'retrieve',
        code: ACCESS_FILTER_VIOLATION,
        message: `${v.chunkId}: ${v.reason}`,
      })),
      ...(trace.embeddingError
        ? [{ node: 'retrieve', code: 'embedding', message: trace.embeddingError }]
        : []),
    ];
    return {
      retrieval: {
        query,
        domainHint: trace.domainHint,
        filter: trace.filter as unknown as Record<string, unknown>,
        keywordOnly: trace.embeddingError !== null,
        vector: trace.vector.map((h) => ({ chunkId: h.chunkId, score: h.score })),
        keyword: trace.keyword.map((h) => ({ chunkId: h.chunkId, score: h.score })),
        fused: trace.fused.map((h) => ({ chunkId: h.chunkId, score: h.score })),
        candidates: sources,
        reranked: [],
        coverage: 'unknown',
        missingAspects: [],
        topRelevance: 0,
        context: [],
      },
      trace: {
        errors,
        flags,
        outputs: {
          retrieval: {
            query,
            domainHint: trace.domainHint,
            domainHintDropped: trace.domainHintDropped,
            keywordOnly: trace.embeddingError !== null,
            filter: trace.filter,
            candidates: sources.map((s) => ({
              chunkId: s.chunkId,
              docSlug: s.docSlug,
              fusedScore: s.fusedScore,
              rank: s.rank,
            })),
            violations: trace.violations,
            missing: trace.missing,
          },
        },
      },
    };
  };
}
