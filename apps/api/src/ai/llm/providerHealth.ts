// Which chat models are worth calling right now (ADR-018). A model that ran out
// of quota or credit, rejected its key, or is unreachable is "cooling down" and
// tried after the healthy ones until its cooldown ends. Process memory only:
// a restart forgets everything, which only costs one failed call per model.
import { LlmError } from './errors';
import { errorStatus, isRetryable, retryAfterMs } from './retry';

export interface ModelRef {
  provider: string;
  modelId: string;
}

/** Why a model was set aside, and for how long. */
export interface Cooldown {
  reason: 'quota' | 'rate_limit' | 'credit' | 'auth' | 'unavailable';
  ms: number;
  /** Credit and key problems affect every model of the provider. */
  scope: 'model' | 'provider';
}

const MINUTE = 60_000;

/**
 * The cooldown an error calls for, or null when the error is about this
 * request (bad schema, invalid output, a timeout or abort) and another model
 * would not help.
 */
export function cooldownFor(err: unknown): Cooldown | null {
  const cause = err instanceof LlmError ? err.cause : err;
  if (err instanceof LlmError && err.kind !== 'provider') return null;
  if (isAbort(cause)) return null;
  const status = errorStatus(cause);
  const hint = retryAfterMs(cause);
  if (status === 429) {
    // Gemini names the exhausted quota ("…PerDay…"); a daily quota will not come back in a minute.
    const daily = /per\s*day|daily/i.test(messageOf(cause));
    return daily
      ? { reason: 'quota', ms: Math.max(hint ?? 0, 60 * MINUTE), scope: 'model' }
      : { reason: 'rate_limit', ms: hint ?? MINUTE, scope: 'model' };
  }
  if (status === 402) return { reason: 'credit', ms: 60 * MINUTE, scope: 'provider' };
  if (status === 401 || status === 403)
    return { reason: 'auth', ms: 60 * MINUTE, scope: 'provider' };
  if ((status !== undefined && status >= 500) || (status === undefined && isRetryable(cause))) {
    return { reason: 'unavailable', ms: hint ?? 30_000, scope: 'model' };
  }
  return null;
}

function isAbort(err: unknown): boolean {
  return err instanceof Error && (err.name === 'AbortError' || err.name === 'TimeoutError');
}

const messageOf = (err: unknown) => (err instanceof Error ? err.message : String(err));

export class ProviderHealth {
  private readonly until = new Map<string, { at: number; reason: Cooldown['reason'] }>();

  constructor(private readonly now: () => number = Date.now) {}

  private static keys(ref: ModelRef): [string, string] {
    return [`${ref.provider}`, `${ref.provider}/${ref.modelId}`];
  }

  /** Remaining cooldown in ms (0 when healthy) and its reason. */
  status(ref: ModelRef): { ms: number; reason?: Cooldown['reason'] } {
    let best: { ms: number; reason?: Cooldown['reason'] } = { ms: 0 };
    for (const key of ProviderHealth.keys(ref)) {
      const entry = this.until.get(key);
      const ms = entry ? entry.at - this.now() : 0;
      if (ms > best.ms) best = { ms, reason: entry!.reason };
    }
    return best;
  }

  markDown(ref: ModelRef, cooldown: Cooldown): void {
    const [providerKey, modelKey] = ProviderHealth.keys(ref);
    this.until.set(cooldown.scope === 'provider' ? providerKey : modelKey, {
      at: this.now() + cooldown.ms,
      reason: cooldown.reason,
    });
  }

  /** A success clears the model's own cooldown (and its provider's). */
  markUp(ref: ModelRef): void {
    for (const key of ProviderHealth.keys(ref)) this.until.delete(key);
  }

  /**
   * Healthy models first, in the given order; then cooling ones, soonest to
   * recover first. Nobody is dropped: when every model is cooling down, they
   * are still tried rather than failing without a call.
   */
  order<T extends ModelRef>(candidates: readonly T[]): T[] {
    const ranked = candidates.map((c, i) => ({ c, i, ms: this.status(c).ms }));
    return ranked.sort((a, b) => a.ms - b.ms || a.i - b.i).map((r) => r.c);
  }
}
