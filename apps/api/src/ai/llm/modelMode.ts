// Per-user model mode (ADR-020): the signed-in user's "Pro" setting decides which
// models answer for them. `pro` uses the paid chain (Gemini → OpenRouter → Ollama
// as last resort); `local` uses the local Ollama model only. The HTTP layer runs
// each authenticated request inside runWithModelMode, and the server's model
// factory reads currentModelMode, so no graph node needs to know about it.
import { AsyncLocalStorage } from 'node:async_hooks';

export const MODEL_MODES = ['pro', 'local'] as const;
export type ModelMode = (typeof MODEL_MODES)[number];

const store = new AsyncLocalStorage<ModelMode>();

export function runWithModelMode<T>(mode: ModelMode, fn: () => T): T {
  return store.run(mode, fn);
}

/** The current request's mode; `local` outside a request (the default: Pro is off). */
export function currentModelMode(): ModelMode {
  return store.getStore() ?? 'local';
}
