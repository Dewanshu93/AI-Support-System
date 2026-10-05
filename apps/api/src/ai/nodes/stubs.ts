// Fixed outputs for stub nodes (W2-02). Each stub keeps a value already set
// in state (so tests steer the path by setting state) and otherwise returns
// these. Each is replaced when its node is built.
import type { Output, Profile, Retrieval } from '../graph/state';
import type { TurnAnalysis } from '../schemas';

export const STUB_PROFILE: Profile = {
  country: 'US',
  employmentType: 'full_time',
  accessLevel: 'standard',
  department: 'Engineering',
  jobTitle: 'Engineer',
};

export const STUB_OUTPUT: Output = { text: '', citations: [], uncovered: [], withdrawn: false };

export function stubAnalysis(text: string): TurnAnalysis {
  return {
    intent: 'question',
    domain: 'IT',
    category: 'network',
    urgency: 'medium',
    urgencyReason: 'stub',
    sensitivity: 'none',
    ambiguity: 'low',
    searchQuery: text,
  };
}

export function stubRetrieval(query: string): Retrieval {
  return {
    query,
    filter: {},
    vector: [],
    keyword: [],
    fused: [{ chunkId: 'stub-chunk', score: 1 }],
    reranked: [{ chunkId: 'stub-chunk', relevance: 3, reason: 'stub' }],
    coverage: 'full',
    topRelevance: 3,
  };
}
