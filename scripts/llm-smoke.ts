// npm run llm:smoke — W1-09 acceptance: a structured output from each chat
// provider whose key is set, plus a Gemini embeddings check. Uses real APIs.
import { HumanMessage } from '@langchain/core/messages';
import { z } from 'zod';
import {
  CHAT_PROVIDERS,
  ConfigError,
  loadConfig,
  loadDotEnv,
  MODEL_TIERS,
} from '../apps/api/src/config';
import {
  createChatModel,
  createEmbeddings,
  embedDocuments,
  embedQuery,
  invokeStructured,
  KEY_FOR as KEY,
  type LlmKeys,
} from '../apps/api/src/ai/llm';

const SmokeSchema = z.object({
  status: z.enum(['ok']),
  sum: z.number().int(),
  capital: z.string(),
});

async function main(): Promise<number> {
  loadDotEnv();
  let config;
  try {
    config = loadConfig();
  } catch (err) {
    if (err instanceof ConfigError) {
      console.error(`Configuration error:\n${err.message}`);
      return 1;
    }
    throw err;
  }
  const keys: LlmKeys = config.env;
  const policy = config.models.call;
  let attempted = 0;
  let failed = 0;

  for (const provider of CHAT_PROVIDERS) {
    if (!keys[KEY[provider]]) {
      console.log(`- ${provider} chat: skipped (${KEY[provider]} not set)`);
      continue;
    }
    for (const tier of MODEL_TIERS) {
      attempted++;
      try {
        const handle = createChatModel(config.models, keys, tier, provider);
        const result = await invokeStructured(
          handle,
          SmokeSchema,
          [
            new HumanMessage(
              'Reply with status "ok", the sum of 17 and 25, and the capital of France.',
            ),
          ],
          { policy, costs: config.models.costs, name: 'smoke' },
        );
        const correct = result.data.sum === 42 && /paris/i.test(result.data.capital);
        if (!correct) failed++;
        console.log(
          `${correct ? '✓' : '✗'} ${provider} ${tier} (${result.modelId}, ${result.mode}): ${JSON.stringify(
            result.data,
          )} — ${result.usage.inputTokens}+${result.usage.outputTokens} tokens, $${result.costUsd.toFixed(
            6,
          )}, ${result.latencyMs} ms, ${result.retries} retries`,
        );
      } catch (err) {
        failed++;
        console.log(`✗ ${provider} ${tier}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  if (!keys.GEMINI_API_KEY) {
    console.log('- gemini embeddings: skipped (GEMINI_API_KEY not set)');
  } else {
    attempted++;
    try {
      const { dimension, model } = config.models.embeddings;
      const started = performance.now();
      const docs = createEmbeddings(config.models, keys, 'document');
      const query = createEmbeddings(config.models, keys, 'query');
      const { vectors } = await embedDocuments(
        docs,
        [
          'US employees get 16 weeks of paid parental leave.',
          'Release print jobs with your badge.',
        ],
        { policy, dimension },
      );
      const q = await embedQuery(query, 'How long is parental leave in the US?', {
        policy,
        dimension,
      });
      const sim = (v: number[]) => {
        const dot = v.reduce((s, x, i) => s + x * q[i]!, 0);
        return dot / (Math.hypot(...v) * Math.hypot(...q));
      };
      const [leave, printing] = vectors.map(sim) as [number, number];
      const ranked = leave > printing;
      if (!ranked) failed++;
      console.log(
        `${ranked ? '✓' : '✗'} gemini embeddings (${model}): ${vectors.length + 1} vectors of ${dimension} dims; ` +
          `similarity leave ${leave.toFixed(3)} vs printing ${printing.toFixed(3)}, ${Math.round(
            performance.now() - started,
          )} ms`,
      );
    } catch (err) {
      failed++;
      console.log(`✗ gemini embeddings: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (attempted === 0) {
    console.error(
      '\nNo provider keys are set; add GEMINI_API_KEY (and optionally OPENROUTER_API_KEY) to .env.',
    );
    return 1;
  }
  console.log(failed === 0 ? '\nLLM smoke test passed.' : `\nLLM smoke test failed (${failed}).`);
  return failed === 0 ? 0 : 1;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  },
);
