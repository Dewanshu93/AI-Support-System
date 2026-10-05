import { GoogleGenerativeAIEmbeddings } from '@langchain/google-genai';
import { VALID_ENV } from '../../../test/helpers/config';
import { loadConfig } from '../../config';
import { callCostUsd } from './costTable';
import { createEmbeddings, embedDocuments, embedQuery } from './embeddings';
import { LlmError } from './errors';
import { FakeEmbeddings } from './fakeModels';

const models = loadConfig({ ...VALID_ENV }).models;
const policy = { timeoutMs: 1000, maxRetries: 0 };

const cosine = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * b[i]!, 0);

describe('createEmbeddings', () => {
  it('builds Gemini embeddings with the configured model, dimension and task type', () => {
    const doc = createEmbeddings(
      models,
      { GEMINI_API_KEY: 'g' },
      'document',
    ) as GoogleGenerativeAIEmbeddings;
    expect(doc).toBeInstanceOf(GoogleGenerativeAIEmbeddings);
    expect(doc.model).toBe('gemini-embedding-001');
    expect(doc.outputDimensionality).toBe(768);
    expect(doc.taskType).toBe('RETRIEVAL_DOCUMENT');
    const query = createEmbeddings(
      models,
      { GEMINI_API_KEY: 'g' },
      'query',
    ) as GoogleGenerativeAIEmbeddings;
    expect(query.taskType).toBe('RETRIEVAL_QUERY');
  });

  it('requires the Gemini key even when chat uses OpenRouter (D-2)', () => {
    expect(() => createEmbeddings(models, { OPENROUTER_API_KEY: 'o' }, 'query')).toThrow(
      /GEMINI_API_KEY is not set; embeddings use Gemini/,
    );
  });
});

describe('embedDocuments / embedQuery', () => {
  it('embeds in batches of 50 and returns one vector per text', async () => {
    const fake = new FakeEmbeddings(768);
    const texts = Array.from({ length: 120 }, (_, i) => `chunk ${i}`);
    const { vectors } = await embedDocuments(fake, texts, { policy, dimension: 768 });
    expect(vectors).toHaveLength(120);
    expect(fake.calls.map((c) => c.length)).toEqual([50, 50, 20]);
  });

  it('rejects vectors of the wrong dimension', async () => {
    await expect(
      embedDocuments(new FakeEmbeddings(3072), ['a'], { policy, dimension: 768 }),
    ).rejects.toEqual(
      new LlmError(
        'invalid_output',
        'Embedding has 3072 dimensions; config/models.yaml expects 768',
      ),
    );
    await expect(
      embedQuery(new FakeEmbeddings(64), 'q', { policy, dimension: 768 }),
    ).rejects.toThrow(/64 dimensions/);
  });
});

describe('FakeEmbeddings', () => {
  const fake = new FakeEmbeddings(768);

  it('is deterministic and unit-length', async () => {
    const [a] = await fake.embedDocuments(['VPN keeps disconnecting']);
    const b = await fake.embedQuery('VPN keeps disconnecting');
    expect(a).toEqual(b);
    expect(Math.hypot(...a!)).toBeCloseTo(1, 6);
  });

  it('gives texts that share words a higher similarity', async () => {
    const q = await fake.embedQuery('parental leave weeks');
    const [near, far] = await fake.embedDocuments([
      'parental leave is 16 weeks',
      'printer toner empty',
    ]);
    expect(cosine(q, near!)).toBeGreaterThan(cosine(q, far!));
  });
});

describe('callCostUsd', () => {
  it('prices input and output tokens per million', () => {
    expect(
      callCostUsd(models.costs, 'gemini-3.8-flash', {
        inputTokens: 2_000_000,
        outputTokens: 100_000,
      }),
    ).toBe(1.875);
    expect(
      callCostUsd(models.costs, 'gemini-embedding-001', { inputTokens: 10_000, outputTokens: 0 }),
    ).toBe(0.0015);
  });

  it('refuses a model without a cost entry', () => {
    expect(() =>
      callCostUsd(models.costs, 'mystery-model', { inputTokens: 1, outputTokens: 1 }),
    ).toThrow(/No cost entry for model "mystery-model"/);
  });
});

describe('StrictGeminiEmbeddings', () => {
  const create = () => createEmbeddings(models, { GEMINI_API_KEY: 'g' }, 'document');
  const withClient = (emb: unknown, batchEmbedContents: jest.Mock) => {
    (emb as { client: unknown }).client = { batchEmbedContents };
    return emb as GoogleGenerativeAIEmbeddings;
  };

  it('propagates a failed batch instead of returning empty vectors', async () => {
    const rateLimited = new Error('[GoogleGenerativeAI Error]: [429 Too Many Requests] quota');
    const emb = withClient(create(), jest.fn().mockRejectedValue(rateLimited));
    await expect(emb.embedDocuments(['a', 'b'])).rejects.toThrow(/429 Too Many Requests/);
  });

  it('sends batches sequentially and keeps order', async () => {
    const calls: number[] = [];
    const batchEmbedContents = jest.fn(async (req: { requests: unknown[] }) => {
      calls.push(req.requests.length);
      return { embeddings: req.requests.map((_, i) => ({ values: [calls.length, i] })) };
    });
    const emb = withClient(create(), batchEmbedContents);
    (emb as unknown as { maxBatchSize: number }).maxBatchSize = 2;
    await expect(emb.embedDocuments(['a', 'b', 'c'])).resolves.toEqual([
      [1, 0],
      [1, 1],
      [2, 0],
    ]);
    expect(calls).toEqual([2, 1]);
  });
});
