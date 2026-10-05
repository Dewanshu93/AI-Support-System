// Provider key checks with no LangChain import, so server startup (and its
// fail-fast config check) does not pay LangChain's load time.
import type { ConfigFiles } from '../../config/schemas';

export type ModelsConfig = ConfigFiles['models'];
export type ChatProvider = ModelsConfig['chat']['provider'];

export interface LlmKeys {
  GEMINI_API_KEY?: string;
  OPENROUTER_API_KEY?: string;
}

export const KEY_FOR: Record<ChatProvider, keyof LlmKeys> = {
  gemini: 'GEMINI_API_KEY',
  openrouter: 'OPENROUTER_API_KEY',
};

/** True when the configured chat provider and the embeddings provider (Gemini, D-2) both have keys. */
export function llmConfigured(config: ModelsConfig, keys: LlmKeys): boolean {
  return Boolean(keys[KEY_FOR[config.chat.provider]] && keys.GEMINI_API_KEY);
}
