// AI workflow tests for W2-04: retrieve and rerankAssess with fakes. No network.
import { ObjectId } from 'mongodb';
import { loadConfig } from '../../src/config';
import type { ChunkDoc } from '../../src/db/schemas';
import { createMemoryCheckpointer, threadConfig } from '../../src/ai/graph/checkpointer';
import { buildSupportGraph } from '../../src/ai/graph/graph';
import {
  newTurn,
  type Profile,
  type Retrieval,
  type State,
  type StateUpdate,
} from '../../src/ai/graph/state';

/** The retrieval a node wrote (nodes never use LangGraph's Overwrite wrapper). */
const ret = (update: StateUpdate) => update.retrieval as Retrieval;
import { LlmError } from '../../src/ai/llm';
import { fakeChatHandle, type FakeReply } from '../../src/ai/llm/fakeModels';
import {
  createRerankAssess,
  formatPassages,
  RERANK_FALLBACK,
  RERANK_LOCAL,
} from '../../src/ai/nodes/rerankAssess';
import {
  createRetrieve,
  DOMAIN_HINT_DROPPED,
  RETRIEVAL_KEYWORD_ONLY,
  type RetrieveNodeDeps,
} from '../../src/ai/nodes/retrieve';
import { stubAnalysis } from '../../src/ai/nodes/stubs';
import { loadPromptRegistry } from '../../src/ai/prompts/registry';
import type { RetrievalResult } from '../../src/ai/retrieval/retrieve';
import { VALID_ENV } from '../helpers/config';

const config = loadConfig(VALID_ENV);
const prompts = loadPromptRegistry(config.prompts.active);
const policy = { ...config.models.call, maxRetries: 0, timeoutMs: 5_000 };
const profile: Profile = {
  country: 'UK',
  employmentType: 'contractor',
  accessLevel: 'standard',
  department: 'Finance',
  jobTitle: 'Analyst',
};

function chunk(slug: string, text: string, doc = new ObjectId()): ChunkDoc {
  return {
    _id: new ObjectId(),
    documentId: doc,
    ordinal: 0,
    sectionPath: ['Entitlement'],
    text,
    contextualText: `${slug} > Entitlement\n${text}`,
    tokenCount: 10,
    embeddingModel: 'gemini-embedding-001',
    domain: 'HR',
    countries: ['UK'],
    employmentTypes: ['contractor'],
    accessLevel: 'standard',
    status: 'active',
    effectiveDate: new Date('2026-01-01'),
    docTitle: `Title ${slug}`,
    docSlug: slug,
  };
}

const chunks = [
  chunk('hr-leave-uk', 'Contractors accrue holiday through their agency.'),
  chunk('hr-leave-uk', 'Full-time employees get 25 days.'),
  chunk('it-vpn', 'Reconnect GlobalProtect.'),
];

function result(over: Partial<RetrievalResult['trace']> = {}): RetrievalResult {
  return {
    candidates: chunks.map((c, i) => ({
      chunk: c,
      fusedScore: 1 / (61 + i),
      rank: i + 1,
      vector: { score: 0.9, rank: i + 1 },
      keyword: null,
    })) as unknown as RetrievalResult['candidates'],
    trace: {
      query: 'q',
      filter: { must: [] },
      domainHint: null,
      domainHintDropped: false,
      embeddingError: null,
      vector: chunks.map((c, i) => ({ chunkId: c._id.toHexString(), score: 0.9, rank: i + 1 })),
      keyword: [],
      fused: chunks.map((c, i) => ({
        chunkId: c._id.toHexString(),
        score: 1 / (61 + i),
        rank: i + 1,
      })),
      violations: [],
      missing: [],
      ...over,
    } as RetrievalResult['trace'],
  };
}

const input = (text = 'Do contractors get holiday?') => ({
  conversationId: 'c1',
  userId: 'u1',
  userMessageId: 'm1',
  assistantMessageId: 'm2',
  text,
  forceEscalate: false,
});

function retrieveNode(res = result()) {
  const calls: Parameters<RetrieveNodeDeps['retrieve']>[0][] = [];
  const node = createRetrieve({
    retrieve: async (i) => {
      calls.push(i);
      return res;
    },
  });
  return { node, calls };
}

function rerankNode(
  replies: FakeReply[],
  options = { nativeStructured: true },
  skipModel?: () => boolean,
) {
  const chat = fakeChatHandle(replies, options);
  const node = createRerankAssess({
    prompts,
    chatFor: () => chat,
    policy,
    costs: config.models.costs,
    retrieval: config.thresholds.retrieval,
    skipModel,
  });
  return { node, chat };
}

const id = (i: number) => chunks[i]!._id.toHexString();

async function retrievedState(analysis = stubAnalysis('contractor holiday entitlement')) {
  const { node } = retrieveNode();
  const base = { input: input(), profile, analysis } as unknown as State;
  const update = await node(base);
  return { ...base, retrieval: ret(update) } as State;
}

describe('retrieve node', () => {
  it('searches with the standalone query and maps candidates to sources', async () => {
    const { node, calls } = retrieveNode();
    const analysis = { ...stubAnalysis('contractor holiday entitlement'), domain: 'HR' as const };
    const update = await node({ input: input(), profile, analysis } as unknown as State);
    expect(calls[0]).toEqual({
      query: 'contractor holiday entitlement',
      profile,
      domainHint: 'HR',
    });
    expect(ret(update)?.candidates.map((c) => c.docSlug)).toEqual([
      'hr-leave-uk',
      'hr-leave-uk',
      'it-vpn',
    ]);
    expect(ret(update)?.candidates[0]).toMatchObject({
      chunkId: id(0),
      effectiveDate: '2026-01-01T00:00:00.000Z',
      rank: 1,
    });
    expect(ret(update)).toMatchObject({
      coverage: 'unknown',
      context: [],
      keywordOnly: false,
    });
    const outputs = (
      update.trace as unknown as { outputs: { retrieval: { candidates: unknown[] } } }
    ).outputs;
    expect(outputs.retrieval.candidates).toHaveLength(3);
  });

  it('gives no domain hint when the analysis is unsure', async () => {
    const { node, calls } = retrieveNode();
    await node({
      input: input(),
      profile,
      analysis: { ...stubAnalysis('x'), domain: 'HR', ambiguity: 'high' },
    } as unknown as State);
    await node({
      input: input(),
      profile,
      analysis: { ...stubAnalysis('x'), domain: 'unknown' },
    } as unknown as State);
    expect(calls.map((c) => c.domainHint)).toEqual([undefined, undefined]);
  });

  it('flags keyword-only retrieval, dropped domain hints and access violations', async () => {
    const { node } = retrieveNode(
      result({
        embeddingError: 'embedding 503',
        domainHintDropped: true,
        violations: [{ chunkId: 'x', reason: 'country' }],
      }),
    );
    const update = await node({ input: input(), profile, analysis: null } as unknown as State);
    expect(ret(update)?.keywordOnly).toBe(true);
    const trace = update.trace as unknown as { flags: string[]; errors: { code: string }[] };
    expect(trace.flags).toEqual([RETRIEVAL_KEYWORD_ONLY, DOMAIN_HINT_DROPPED]);
    expect(trace.errors.map((e) => e.code)).toEqual(['ACCESS_FILTER_VIOLATION', 'embedding']);
  });

  it('requires a loaded profile', async () => {
    const { node } = retrieveNode();
    await expect(node({ input: input(), profile: null } as unknown as State)).rejects.toThrow(
      'profile not loaded',
    );
  });
});

describe('rerankAssess node', () => {
  it('applies the ranking, drops unknown IDs and builds the labelled context', async () => {
    const reply = JSON.stringify({
      ranked: [
        { chunkId: id(0), relevance: 3, reason: 'contractor holiday' },
        { chunkId: 'made-up-chunk', relevance: 3, reason: 'invented' },
        { chunkId: id(2), relevance: 0, reason: 'VPN, unrelated' },
        { chunkId: id(1), relevance: 1, reason: 'employees, not contractors' },
      ],
      coverage: 'full',
      missingAspects: [],
    });
    const { node, chat } = rerankNode([reply]);
    const update = await node(await retrievedState());
    expect(chat.model.calls).toHaveLength(1);
    const retrieval = ret(update);
    expect(retrieval.reranked.map((r) => r.chunkId)).toEqual([id(0), id(1), id(2)]);
    expect(retrieval).toMatchObject({ coverage: 'full', topRelevance: 3 });
    expect(retrieval.context.map((s) => [s.marker, s.chunkId, s.relevance])).toEqual([
      ['S1', id(0), 3],
      ['S2', id(1), 1],
    ]);
    const trace = update.trace as unknown as {
      flags: string[];
      outputs: { rerank: { droppedIds: string[] } };
      llmCalls: { promptRef: string }[];
    };
    expect(trace.outputs.rerank.droppedIds).toEqual(['made-up-chunk']);
    expect(trace.flags).toEqual([]);
    expect(trace.llmCalls[0]!.promptRef).toBe(prompts.get('rerank_assess').ref);
  });

  it('double failure → fused-order fallback with coverage "unknown"', async () => {
    const { node, chat } = rerankNode(['nope', '{"ranked": "bad"}'], { nativeStructured: false });
    const update = await node(await retrievedState());
    expect(chat.model.calls).toHaveLength(2);
    expect(ret(update)).toMatchObject({ coverage: 'unknown', topRelevance: 3 });
    expect(ret(update).reranked.map((r) => r.chunkId)).toEqual([id(0), id(1), id(2)]);
    expect(ret(update).context[0]!.chunkId).toBe(id(0));
    expect((update.trace as unknown as { flags: string[] }).flags).toEqual([RERANK_FALLBACK]);
  });

  it('provider failure → fallback without a retry', async () => {
    const { node, chat } = rerankNode([new LlmError('timeout', 'timed out'), 'unused']);
    const update = await node(await retrievedState());
    expect(chat.model.calls).toHaveLength(1);
    expect(ret(update).coverage).toBe('unknown');
  });

  it('local mode (Pro off, ADR-020) → search order, coverage "partial", no LLM call', async () => {
    const { node, chat } = rerankNode(['unused'], undefined, () => true);
    const update = await node(await retrievedState());
    expect(chat.model.calls).toHaveLength(0);
    expect(ret(update)).toMatchObject({ coverage: 'partial', topRelevance: 3 });
    expect(ret(update).reranked.map((r) => r.chunkId)).toEqual([id(0), id(1), id(2)]);
    expect(ret(update).context[0]!.chunkId).toBe(id(0));
    expect((update.trace as unknown as { flags: string[] }).flags).toEqual([RERANK_LOCAL]);
  });

  it('a request that is not local still asks the model', async () => {
    const { node, chat } = rerankNode(
      [JSON.stringify({ ranked: [], coverage: 'none', missingAspects: [] })],
      undefined,
      () => false,
    );
    await node(await retrievedState());
    expect(chat.model.calls).toHaveLength(1);
  });

  it('no candidates → no LLM call, coverage "none", empty context', async () => {
    const { node, chat } = rerankNode([]);
    const state = await retrievedState();
    const update = await node({ ...state, retrieval: { ...state.retrieval!, candidates: [] } });
    expect(chat.model.calls).toHaveLength(0);
    expect(ret(update)).toMatchObject({ coverage: 'none', topRelevance: 0, context: [] });
  });

  it('P-2 receives chunk IDs, titles, sections and effective dates as untrusted data', async () => {
    const { node, chat } = rerankNode([
      JSON.stringify({ ranked: [], coverage: 'none', missingAspects: ['everything'] }),
    ]);
    const state = await retrievedState();
    await node(state);
    const human = String(chat.model.calls[0]![1]!.content);
    expect(human).toContain('<untrusted_passages>');
    expect(human).toContain(formatPassages(state.retrieval!.candidates));
    expect(human).toContain(
      `[chunkId: ${id(0)}] Title hr-leave-uk > Entitlement (effective 2026-01-01)`,
    );
    expect(human).toContain(
      '<untrusted_question>\ncontractor holiday entitlement\n</untrusted_question>',
    );
  });
});

describe('graph with real retrieve and rerankAssess', () => {
  it('runs retrieve → rerankAssess → decide and traces both', async () => {
    const { node: retrieve } = retrieveNode();
    const { node: rerankAssess } = rerankNode([
      JSON.stringify({
        ranked: [{ chunkId: id(0), relevance: 3, reason: 'direct' }],
        coverage: 'full',
        missingAspects: [],
      }),
    ]);
    const graph = buildSupportGraph({
      checkpointer: createMemoryCheckpointer(),
      nodes: { retrieve, rerankAssess },
    });
    const state = (await graph.invoke(newTurn(input()), threadConfig('rr-1'))) as State;
    expect(state.trace.steps.map((s) => s.node).slice(2, 6)).toEqual([
      'analyzeTurn',
      'retrieve',
      'rerankAssess',
      'decide',
    ]);
    expect(state.retrieval?.context.map((s) => s.marker)).toEqual(['S1']);
    expect(Object.keys(state.trace.outputs).sort()).toEqual(['rerank', 'retrieval']);
  });
});
