// In-memory knowledge-gap storage for API tests (W4-02). Candidate turns are
// given as-is; the query's narrowing (range, restricted, eval) is applied here so
// the service's own rule is still exercised on the rows it receives.
import type { GapClusterDoc } from '../../src/db/schemas';
import type { GapCandidate, GapsRepository } from '../../src/modules/gaps/repository';
import { createGapsService, type GapsServiceDeps } from '../../src/modules/gaps/service';
import type { AppDeps } from '../../src/deps';
import { loadConfig } from '../../src/config';
import { VALID_ENV } from './config';

export interface TestCandidate extends GapCandidate {
  createdAt: Date;
}

export function memoryGapsRepository(
  candidates: TestCandidate[] = [],
): GapsRepository & { stored: GapClusterDoc[] } {
  let stored: GapClusterDoc[] = [];
  return {
    get stored() {
      return stored;
    },
    loadCandidates: async ({ start, end }) =>
      candidates.filter((c) => c.createdAt >= start && c.createdAt < end),
    replaceSnapshot: async (clusters) => {
      stored = [...clusters];
    },
    latestSnapshot: async () => [...stored].sort((a, b) => b.questionCount - a.questionCount),
  };
}

const { thresholds } = loadConfig(VALID_ENV);

/** Gaps deps for buildTestApp; without `embed` / `label` a refresh answers 503. */
export function testGaps(
  options: Partial<Omit<GapsServiceDeps, 'repository'>> & { repository?: GapsRepository } = {},
): AppDeps['gaps'] {
  const repository = options.repository ?? memoryGapsRepository();
  return {
    repository,
    service: createGapsService({ config: thresholds.gaps, ...options, repository }),
  };
}
