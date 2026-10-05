import type { ConfigFiles } from '../../config/schemas';
import { LlmError } from './errors';

export type CostTable = ConfigFiles['models']['costs'];

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

/** USD cost of one call, from the per-1M-token prices in config/models.yaml. */
export function callCostUsd(costs: CostTable, model: string, usage: TokenUsage): number {
  const price = costs[model];
  if (!price)
    throw new LlmError('config', `No cost entry for model "${model}" in config/models.yaml`);
  const usd =
    (usage.inputTokens * price.input + usage.outputTokens * (price.output ?? 0)) / 1_000_000;
  return Math.round(usd * 1e8) / 1e8;
}
