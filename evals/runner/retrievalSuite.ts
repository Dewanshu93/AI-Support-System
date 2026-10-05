// Retrieval suite: for each golden case with expected or forbidden documents,
// runs profile-safe hybrid retrieval as the case's user and records the top
// chunks of each mode (vector only, keyword only, fused).
import type { ChunkDoc } from '../../apps/api/src/db/schemas';
import type { AccessProfile } from '../../apps/api/src/ai/retrieval/accessRules';
import type { RetrievalResult } from '../../apps/api/src/ai/retrieval/retrieve';
import type { GoldenCase } from './schema';
import { type CaseRetrieval, RECALL_K, type RetrievedDoc } from './scorers';

export interface RetrievalSuiteDeps {
  profileFor(email: string): AccessProfile | undefined;
  retrieve(query: string, profile: AccessProfile): Promise<RetrievalResult>;
  loadChunks(ids: string[]): Promise<ChunkDoc[]>;
  /** Progress callback, one line per case. */
  log?(line: string): void;
}

export interface SuiteCaseResult {
  goldenCase: GoldenCase;
  retrieval: CaseRetrieval;
  latencyMs: number;
  error: string | null;
}

/** Cases the retrieval suite can score: those naming expected or forbidden documents. */
export function retrievalCases(cases: GoldenCase[]): GoldenCase[] {
  return cases.filter(
    (c) => c.expected.docSlugs.length > 0 || c.expected.forbiddenDocSlugs.length > 0,
  );
}

/** The retrieval query for a case: all user turns (planned clarifications included). */
export const caseQuery = (c: GoldenCase) => c.turns.map((t) => t.content).join(' ');

const toDoc = (chunk: ChunkDoc): RetrievedDoc => ({
  slug: chunk.docSlug,
  documentId: chunk.documentId.toHexString(),
});

export async function runRetrievalSuite(
  cases: GoldenCase[],
  deps: RetrievalSuiteDeps,
): Promise<SuiteCaseResult[]> {
  const results: SuiteCaseResult[] = [];
  for (const c of cases) {
    const base: CaseRetrieval = {
      caseId: c.id,
      category: c.category,
      tags: c.tags,
      expectedRefs: c.expected.docSlugs,
      forbiddenRefs: c.expected.forbiddenDocSlugs,
      results: { vector: [], keyword: [], fused: [] },
    };
    const profile = deps.profileFor(c.userEmail);
    if (!profile) {
      results.push({
        goldenCase: c,
        retrieval: base,
        latencyMs: 0,
        error: `unknown user ${c.userEmail}`,
      });
      continue;
    }
    const started = performance.now();
    try {
      const { candidates, trace } = await deps.retrieve(caseQuery(c), profile);
      const ids = [...new Set([...trace.vector, ...trace.keyword].slice(0).map((h) => h.chunkId))];
      const chunks = new Map((await deps.loadChunks(ids)).map((ch) => [ch._id.toHexString(), ch]));
      const top = (hits: { chunkId: string }[]) =>
        hits
          .map((h) => chunks.get(h.chunkId))
          .filter((ch): ch is ChunkDoc => ch !== undefined)
          .slice(0, RECALL_K)
          .map(toDoc);
      base.results = {
        vector: top(trace.vector),
        keyword: top(trace.keyword),
        fused: candidates.slice(0, RECALL_K).map((cand) => toDoc(cand.chunk)),
      };
      const latencyMs = Math.round(performance.now() - started);
      results.push({ goldenCase: c, retrieval: base, latencyMs, error: null });
      deps.log?.(`${c.id} ${base.results.fused.map((d) => d.slug).join(', ') || '(none)'}`);
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      results.push({
        goldenCase: c,
        retrieval: base,
        latencyMs: Math.round(performance.now() - started),
        error,
      });
      deps.log?.(`${c.id} ERROR ${error}`);
    }
  }
  return results;
}
