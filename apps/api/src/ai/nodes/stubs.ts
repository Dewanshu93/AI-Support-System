// Fixed outputs for stub nodes (W2-02). Each stub keeps a value already set
// in state (so tests steer the path by setting state) and otherwise returns
// these. Each is replaced when its node is built.
import {
  EMPTY_TICKET_FLOW,
  type Output,
  type Profile,
  type Retrieval,
  type State,
  type StateUpdate,
} from '../graph/state';
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
  const source = {
    chunkId: 'stub-chunk',
    documentId: 'stub-doc',
    docSlug: 'stub-doc',
    docTitle: 'Stub document',
    sectionPath: ['Stub'],
    effectiveDate: '2026-01-01T00:00:00.000Z',
    text: 'Stub text.',
    fusedScore: 1 / 61,
    rank: 1,
  };
  return {
    query,
    domainHint: null,
    filter: {},
    keywordOnly: false,
    vector: [],
    keyword: [],
    fused: [{ chunkId: 'stub-chunk', score: 1 / 61 }],
    candidates: [source],
    reranked: [{ chunkId: 'stub-chunk', relevance: 3, reason: 'stub' }],
    coverage: 'full',
    missingAspects: [],
    topRelevance: 3,
    context: [{ ...source, marker: 'S1', relevance: 3 }],
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

export function stubRetrieve(state: State): StateUpdate {
  return {
    retrieval: state.retrieval ?? stubRetrieval(state.analysis?.searchQuery ?? state.input.text),
  };
}

export function stubRerankAssess(state: State): StateUpdate {
  return { retrieval: state.retrieval };
}

export function stubDecide(state: State): StateUpdate {
  return {
    decision: state.decision ?? {
      value: 'ANSWER',
      reasonCode: 'EVIDENCE_STRONG',
      rulesFired: ['evidence_strong'],
    },
  };
}

export function stubAnswer(state: State): StateUpdate {
  const decision = state.decision;
  const mode =
    decision?.value === 'ESCALATE' && decision.reasonCode === 'SAFETY'
      ? 'safety_steps'
      : decision?.value === 'PARTIAL'
        ? 'partial'
        : 'answer';
  return {
    output: {
      ...STUB_OUTPUT,
      text: 'Stub answer [S1].',
      citations: [
        {
          marker: 'S1',
          chunkId: 'stub-chunk',
          documentId: 'stub-doc',
          docTitle: 'Stub document',
          sectionPath: ['Stub'],
          effectiveDate: '2026-01-01T00:00:00.000Z',
        },
      ],
      ...state.output,
      mode,
    },
  };
}

/** Keeps a preset withdrawal and records it as section 5 specifies. */
export function stubValidateCitations(state: State): StateUpdate {
  if (!state.output?.withdrawn) return {};
  return {
    decision: {
      value: 'ESCALATE',
      reasonCode: 'CITATION_INVALID',
      rulesFired: [...(state.decision?.rulesFired ?? []), 'citations'],
    },
  };
}

export function stubClarify(_state: State): StateUpdate {
  return { output: { ...STUB_OUTPUT, text: 'Stub clarifying question?' } };
}

export function stubOutOfScope(_state: State): StateUpdate {
  return {
    output: { ...STUB_OUTPUT, text: 'Stub out-of-scope reply.', handoff: { kind: 'out_of_scope' } },
  };
}

export function stubSensitiveHandoff(_state: State): StateUpdate {
  return {
    output: {
      ...STUB_OUTPUT,
      text: 'Stub sensitive handoff.',
      handoff: { kind: 'sensitive', contact: 'stub', offerPrivateContact: true },
    },
  };
}

/** Writes nothing; the real persist node needs repositories (runtime.ts). */
export function stubPersist(_state: State): StateUpdate {
  return {};
}

export function stubSlotFill(state: State): StateUpdate {
  return {
    ticketFlow: {
      ...state.ticketFlow,
      active: true,
      category: state.ticketFlow.category ?? state.analysis?.category,
    },
  };
}

export function stubClarifyForTicket(state: State): StateUpdate {
  const asked = state.ticketFlow.requiredMissing.slice(0, 2).join(', ');
  return {
    ticketFlow: { ...state.ticketFlow, clarifyRounds: state.ticketFlow.clarifyRounds + 1 },
    output: { ...STUB_OUTPUT, ...state.output, text: `Stub question for ${asked}?` },
  };
}

/** Keeps any answer text (safety mode); the draft has the TicketDraft shape. */
export function stubBuildDraft(state: State): StateUpdate {
  return {
    ticketFlow: { ...state.ticketFlow, requiredMissing: [] },
    output: {
      ...STUB_OUTPUT,
      text: 'Stub draft ready for review.',
      ...state.output,
      draft: {
        domain: state.analysis?.domain === 'HR' ? 'HR' : 'IT',
        category: state.ticketFlow.category ?? 'software',
        subcategory: null,
        queue: { id: 'it_software', label: 'IT Software' },
        priority: 'medium',
        aiUrgency: 'medium',
        priorityFloorApplied: null,
        impactScope: 'unknown',
        summary: 'Stub summary',
        description: 'Stub description',
        alreadyTried: [],
        errorMessages: [],
        fields: state.ticketFlow.fields,
        aiFilledFields: [],
        requiredMissing: [],
        articlesShown: [],
        restricted: false,
      },
    },
  };
}

export function stubCreateTicket(state: State): StateUpdate {
  return {
    ticketFlow: EMPTY_TICKET_FLOW,
    output: { ...STUB_OUTPUT, ...state.output, ticketId: 'stub-ticket' },
  };
}
