// The runtime turn graph: supportTurnGraph with every real node built so far
// wired to its dependencies. Nodes not built yet (ticket flow, W3) stay stubs.
// server.ts builds it with real providers; tests build it with fake models.
import type { BaseCheckpointSaver } from '@langchain/langgraph';
import type { ConfigFiles } from '../../config/schemas';
import type { ConversationsRepository } from '../../modules/conversations/repository';
import type { UsersRepository } from '../../modules/users/repository';
import { compilePrecheckRules } from '../guards/precheckRules';
import type { CallPolicy, ChatHandle, CostTable, ModelTier } from '../llm';
import { createAnalyzeTurn } from '../nodes/analyzeTurn';
import { createAnswer } from '../nodes/answer';
import { createClarify } from '../nodes/clarify';
import { createDecide } from '../nodes/decide';
import { createLoadContext } from '../nodes/loadContext';
import { createOutOfScope } from '../nodes/outOfScope';
import { createPersist } from '../nodes/persist';
import { createPrecheck } from '../nodes/precheck';
import { createRerankAssess } from '../nodes/rerankAssess';
import { createRetrieve, type RetrieveNodeDeps } from '../nodes/retrieve';
import { createSensitiveHandoff } from '../nodes/sensitiveHandoff';
import { createValidateCitations } from '../nodes/validateCitations';
import type { PromptRegistry } from '../prompts/registry';
import { buildSupportGraph, type SupportGraph } from './graph';

export interface TurnGraphDeps {
  config: Pick<
    ConfigFiles,
    'thresholds' | 'templates' | 'taxonomy' | 'sensitive' | 'priorityRules'
  > & {
    models: { call: CallPolicy; costs: CostTable };
  };
  prompts: PromptRegistry;
  chatFor: (tier: ModelTier, options?: { temperature?: number }) => ChatHandle;
  users: Pick<UsersRepository, 'findById'>;
  conversations: ConversationsRepository;
  retrieve: RetrieveNodeDeps['retrieve'];
  checkpointer: BaseCheckpointSaver;
  now?: () => Date;
}

export function buildTurnGraph(deps: TurnGraphDeps): SupportGraph {
  const { config } = deps;
  const templates = config.templates.templates;
  const llm = {
    prompts: deps.prompts,
    chatFor: deps.chatFor,
    policy: config.models.call,
    costs: config.models.costs,
  };
  return buildSupportGraph({
    checkpointer: deps.checkpointer,
    nodes: {
      loadContext: createLoadContext({
        users: deps.users,
        conversations: deps.conversations,
        historyLimit: config.thresholds.conversation.historyMessages,
      }),
      precheck: createPrecheck(compilePrecheckRules(config.sensitive, config.priorityRules)),
      analyzeTurn: createAnalyzeTurn({ ...llm, taxonomy: config.taxonomy }),
      retrieve: createRetrieve({ retrieve: deps.retrieve }),
      rerankAssess: createRerankAssess({ ...llm, retrieval: config.thresholds.retrieval }),
      decide: createDecide(config.thresholds.decision),
      answer: createAnswer(llm),
      validateCitations: createValidateCitations({ templates }),
      clarify: createClarify({ ...llm, templates }),
      outOfScope: createOutOfScope({ templates }),
      sensitiveHandoff: createSensitiveHandoff({ templates }),
      persist: createPersist({
        conversations: deps.conversations,
        thresholds: config.thresholds.decision,
        now: deps.now,
      }),
    },
  });
}
