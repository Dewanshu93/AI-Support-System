// Models for an eval run (W4-05). `pro` = the configured chain (as `npm run eval`
// always did); `local` = the local Ollama model only (a UI run by an admin with
// Pro off, ADR-020). LLM_MODE record / replay / cache wrap both, exactly like the
// API, so the E2E smoke run replays its recording and never calls a provider.
// Query embeddings stay Gemini in both modes (the index is Gemini, ADR-018).
import path from 'node:path';
import {
  type ChatHandle,
  createChatModel,
  createEmbeddings,
  createLocalChatModel,
  embedQuery,
  type ModelTier,
  resolveChatModel,
} from '../../apps/api/src/ai/llm';
import {
  LlmRecordings,
  recordedChatHandle,
  recordedEmbedQuery,
} from '../../apps/api/src/ai/llm/recording';
import { type AppConfig, REPO_ROOT } from '../../apps/api/src/config';

export const EVAL_MODEL_MODES = ['pro', 'local'] as const;
export type EvalModelMode = (typeof EVAL_MODEL_MODES)[number];

export interface EvalModels {
  chatFor: (tier: ModelTier, options?: { temperature?: number }) => ChatHandle;
  embedQuery: (text: string) => Promise<number[]>;
  /** For logs and reports, e.g. "local: dolphin3:latest". */
  describe: string;
}

export function evalModels(config: AppConfig, mode: EvalModelMode = 'pro'): EvalModels {
  const llmMode = config.env.LLM_MODE;
  const recordings =
    llmMode === 'live'
      ? null
      : new LlmRecordings(
          config.env.LLM_RECORDINGS_FILE ??
            (llmMode === 'cache'
              ? path.join(REPO_ROOT, '.llm-cache', 'replies.json')
              : path.join(REPO_ROOT, 'e2e', 'fixtures', 'llm-recordings.json')),
        );

  const live = (tier: ModelTier, options?: { temperature?: number }) =>
    mode === 'local'
      ? createLocalChatModel(config.models, config.env, tier, options)
      : createChatModel(config.models, config.env, tier, undefined, options);
  const chatFor: EvalModels['chatFor'] = (tier, options) =>
    recordings && llmMode !== 'live'
      ? recordedChatHandle(
          llmMode,
          recordings,
          () => live(tier, options),
          resolveChatModel(config.models, tier),
        )
      : live(tier, options);

  let embeddings: ReturnType<typeof createEmbeddings> | undefined;
  const liveEmbed = (text: string) => {
    embeddings ??= createEmbeddings(config.models, config.env, 'query');
    return embedQuery(embeddings, text, {
      policy: { ...config.models.call, maxRetries: 5 },
      dimension: config.models.embeddings.dimension,
    });
  };

  const provider = config.models.chat.provider;
  const describe =
    mode === 'local'
      ? `local: ${config.models.chat.models.ollama?.fast ?? 'ollama'}`
      : `${provider}: ${Object.values(config.models.chat.models[provider]).join(', ')}`;
  return {
    chatFor,
    embedQuery:
      recordings && llmMode !== 'live'
        ? recordedEmbedQuery(llmMode, recordings, liveEmbed)
        : liveEmbed,
    describe: llmMode === 'live' ? describe : `${describe} (LLM_MODE=${llmMode})`,
  };
}
