// Fixed outputs for stub nodes (W2-02). Each stub keeps a value already set
// in state (so tests steer the path by setting state) and otherwise returns
// these. Each is replaced when its node is built.
import type { Output, Profile, Retrieval, State, StateUpdate } from '../graph/state';
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

// Stub versions of nodes that now have real implementations; used as graph
// defaults until the API wires the real nodes (W2-08) and by path tests.
export function stubLoadContext(state: State): StateUpdate {
  return { profile: state.profile ?? STUB_PROFILE, history: state.history };
}

export function stubPrecheck(state: State): StateUpdate {
  return {
    precheckResult: state.precheckResult ?? {
      sensitiveHit: false,
      safetyHit: false,
      matchedRules: [],
    },
  };
}

export function stubAnalyzeTurn(state: State): StateUpdate {
  return { analysis: state.analysis ?? stubAnalysis(state.input.text) };
}
