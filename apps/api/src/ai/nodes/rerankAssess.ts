// rerankAssess (AI, P-2 rerank_assess; playbook section 7 steps 7–8). The model
// orders the fused candidates and judges coverage; code drops unknown IDs,
// builds the final [S1]…[S5] context, and falls back to fused order on failure
// (coverage "unknown", so decision rules 7–8 cannot fire).
import type { ConfigFiles } from '../../config/schemas';
import type {
  ContextSource,
  LlmCallTrace,
  Profile,
  RankedChunk,
  Retrieval,
  SourceChunk,
  State,
  StateUpdate,
} from '../graph/state';
import type { CallPolicy, ChatHandle, CostTable, ModelTier } from '../llm';
import type { PromptRegistry } from '../prompts/registry';
import { applyRanking, buildContext, fallbackRanking, topRelevance } from '../retrieval/rerank';
import { RerankAssessmentSchema } from '../schemas';
import { formatProfile } from './promptFormat';
import { structuredCallWithRetry, type TraceError } from './structuredCall';

export const RERANK_FALLBACK = 'RERANK_FALLBACK';
const NODE = 'rerankAssess';

export interface RerankDeps {
  prompts: PromptRegistry;
  chatFor: (tier: ModelTier) => ChatHandle;
  policy: CallPolicy;
  costs: CostTable;
  retrieval: Pick<ConfigFiles['thresholds']['retrieval'], 'contextTopK' | 'contextMinRelevance'>;
}

/** Passages for P-2: chunk ID, title, section path and effective date, then the text. */
export function formatPassages(candidates: SourceChunk[]): string {
  return candidates
    .map(
      (c) =>
        `[chunkId: ${c.chunkId}] ${c.docTitle} > ${c.sectionPath.join(' > ')} (effective ${c.effectiveDate.slice(0, 10)})\n${c.text}`,
    )
    .join('\n\n');
}

export interface Assessment {
  reranked: RankedChunk[];
  coverage: Retrieval['coverage'];
  missingAspects: string[];
  topRelevance: number;
  context: ContextSource[];
  droppedIds: string[];
  fallback: boolean;
  llmCalls: LlmCallTrace[];
  errors: TraceError[];
}

/** Rerank + assess + final context. Also used by the retrieval eval (reranked mode). */
export async function assessCandidates(
  deps: RerankDeps,
  input: { question: string; profile: Profile | null; candidates: SourceChunk[] },
): Promise<Assessment> {
  const contextOptions = {
    topK: deps.retrieval.contextTopK,
    minRelevance: deps.retrieval.contextMinRelevance,
  };
  if (input.candidates.length === 0) {
    // Nothing to judge: no LLM call.
    return {
      reranked: [],
      coverage: 'none',
      missingAspects: [],
      topRelevance: 0,
      context: [],
      droppedIds: [],
      fallback: false,
      llmCalls: [],
      errors: [],
    };
  }
  const { prompt, messages } = await deps.prompts.render('rerank_assess', {
    profile: formatProfile(input.profile),
    question: input.question,
    passages: formatPassages(input.candidates),
  });
  const { data, llmCalls, errors } = await structuredCallWithRetry({
    node: NODE,
    prompt,
    messages,
    schema: RerankAssessmentSchema,
    chat: deps.chatFor(prompt.modelTier),
    policy: deps.policy,
    costs: deps.costs,
  });

  if (!data) {
    const reranked = fallbackRanking(input.candidates);
    return {
      reranked,
      coverage: 'unknown',
      missingAspects: [],
      topRelevance: topRelevance(reranked),
      context: buildContext(reranked, input.candidates, contextOptions),
      droppedIds: [],
      fallback: true,
      llmCalls,
      errors,
    };
  }
  const { reranked, droppedIds } = applyRanking(input.candidates, data.ranked);
  return {
    reranked,
    coverage: data.coverage,
    missingAspects: data.missingAspects,
    topRelevance: topRelevance(reranked),
    context: buildContext(reranked, input.candidates, contextOptions),
    droppedIds,
    fallback: false,
    llmCalls,
    errors,
  };
}

export function createRerankAssess(deps: RerankDeps) {
  return async function rerankAssess(state: State): Promise<StateUpdate> {
    if (!state.retrieval) throw new Error('rerankAssess: retrieve did not run');
    const result = await assessCandidates(deps, {
      question: state.analysis?.searchQuery ?? state.input.text,
      profile: state.profile,
      candidates: state.retrieval.candidates,
    });
    return {
      retrieval: {
        ...state.retrieval,
        reranked: result.reranked,
        coverage: result.coverage,
        missingAspects: result.missingAspects,
        topRelevance: result.topRelevance,
        context: result.context,
      },
      trace: {
        llmCalls: result.llmCalls,
        errors: result.errors,
        flags: result.fallback ? [RERANK_FALLBACK] : [],
        outputs: {
          rerank: {
            reranked: result.reranked,
            coverage: result.coverage,
            missingAspects: result.missingAspects,
            topRelevance: result.topRelevance,
            droppedIds: result.droppedIds,
            context: result.context.map((s) => ({
              marker: s.marker,
              chunkId: s.chunkId,
              relevance: s.relevance,
            })),
          },
        },
      },
    };
  };
}
