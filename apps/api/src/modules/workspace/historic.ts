// Historic demo data (W4-08): ~120 SYNTHETIC conversations over the 14 days before
// "today", with turn traces, feedback, ~40 tickets and their events, and a
// knowledge-gap snapshot, so the admin overview, traces, gaps and agent queues
// look alive in a demo. Drawn from seed/historic/scenarios.json with a fixed seed:
// the same "today" always gives the same data (stable ids), so seeding is
// idempotent. Owned by synthetic employees (seed/historic/people.json) who are not
// on the login picker; conversations and tickets carry `synthetic: true`.
import fs from 'node:fs';
import path from 'node:path';
import {
  AccessLevelSchema,
  CountrySchema,
  DecisionSchema,
  DomainSchema,
  EmploymentTypeSchema,
  type IsoDate,
  PrioritySchema,
} from '@sd/shared';
import type { Collection, ObjectId } from 'mongodb';
import { z } from 'zod';
import { REPO_ROOT } from '../../config';
import type { ConfigFiles } from '../../config/schemas';
import { validateForWrite } from '../../db/collections';
import {
  type ConversationDoc,
  ConversationSchema,
  type EmailOutboxDoc,
  type FeedbackDoc,
  FeedbackSchema,
  type GapClusterDoc,
  GapClusterSchema,
  type MessageDoc,
  MessageSchema,
  type TicketDoc,
  type TicketEventDoc,
  TicketEventSchema,
  TicketSchema,
  type TurnTraceDoc,
  TurnTraceSchema,
  type UserDoc,
  UserSchema,
} from '../../db/schemas';
import { addDays } from '../../domain/workday';
import { seedId } from './seed';

export const HISTORIC_DIR = path.join(REPO_ROOT, 'seed', 'historic');
export const HISTORIC_DAYS = 14;
export const HISTORIC_CONVERSATIONS = 120;
const SEED = 20261008;

// --- catalog ---------------------------------------------------------------------

const ScenarioSchema = z.object({
  key: z.string().regex(/^[a-z0-9-]+$/),
  weight: z.number().int().min(1),
  audience: z
    .object({
      countries: z.array(CountrySchema).optional(),
      employmentTypes: z.array(EmploymentTypeSchema).optional(),
    })
    .optional(),
  domain: DomainSchema,
  category: z.string(),
  decision: DecisionSchema,
  reasonCode: z.string(),
  docSlugs: z.array(z.string()),
  questions: z.array(z.string().min(1)).min(1),
  answer: z.string().min(1),
  uncovered: z.array(z.string()).optional(),
  gap: z.object({ label: z.string(), domain: z.enum(['IT', 'HR', 'unknown']) }).optional(),
  safety: z.string().optional(),
  sensitive: z.string().optional(),
  ticket: z
    .object({
      summary: z.string(),
      priority: PrioritySchema,
      aiUrgency: PrioritySchema.optional(),
      floor: z.string().optional(),
      fields: z.record(z.string(), z.string()),
    })
    .optional(),
});
export type HistoricScenario = z.infer<typeof ScenarioSchema>;

const PersonSchema = z.object({
  name: z.string(),
  country: CountrySchema,
  employmentType: EmploymentTypeSchema,
  department: z.string(),
  jobTitle: z.string(),
  accessLevel: AccessLevelSchema.default('standard'),
});

export interface HistoricCatalog {
  scenarios: HistoricScenario[];
  people: z.infer<typeof PersonSchema>[];
}

export function loadHistoricCatalog(dir: string = HISTORIC_DIR): HistoricCatalog {
  const read = (file: string) => JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
  return {
    scenarios: z.array(ScenarioSchema).parse(read('scenarios.json').scenarios),
    people: z.array(PersonSchema).parse(read('people.json').people),
  };
}

// --- builder ---------------------------------------------------------------------

/** mulberry32: a small deterministic PRNG, so the same seed gives the same history. */
function prng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface HistoricData {
  users: UserDoc[];
  conversations: ConversationDoc[];
  messages: MessageDoc[];
  turnTraces: TurnTraceDoc[];
  feedback: FeedbackDoc[];
  tickets: TicketDoc[];
  ticketEvents: TicketEventDoc[];
  gapClusters: GapClusterDoc[];
}

export interface HistoricInput {
  catalog: HistoricCatalog;
  today: IsoDate;
  routing: ConfigFiles['routing'];
  /** Agents who act on the tickets: an IT agent and an HR agent (seeded personas). */
  agents: { it: UserDoc; hr: UserDoc };
  /** Real chunk ids per document slug, so traces resolve in the trace viewer (may be empty). */
  chunksBySlug?: Map<string, ObjectId[]>;
}

const emailOf = (name: string) =>
  `${name
    .toLowerCase()
    .replace(/[^a-z ]/g, '')
    .trim()
    .replace(/\s+/g, '.')}@example.com`;

const TICKET_STATUS_WEIGHTS: [TicketDoc['status'], number][] = [
  ['new', 3],
  ['in_progress', 3],
  ['waiting_on_employee', 1],
  ['resolved', 3],
];

export function buildHistoric(input: HistoricInput): HistoricData {
  const { catalog, today, routing, agents } = input;
  const rand = prng(SEED);
  const pick = <T>(list: readonly T[]): T => list[Math.floor(rand() * list.length)]!;
  const weighted = <T>(entries: readonly [T, number][]): T => {
    const total = entries.reduce((n, [, w]) => n + w, 0);
    let r = rand() * total;
    for (const [value, w] of entries) if ((r -= w) < 0) return value;
    return entries[entries.length - 1]![0];
  };
  const between = (lo: number, hi: number) => lo + rand() * (hi - lo);
  const created = new Date(`${addDays(today, -HISTORIC_DAYS)}T00:00:00Z`);

  const out: HistoricData = {
    users: catalog.people.map((p, i) => ({
      _id: seedId(`historic:user:${i}`),
      email: emailOf(p.name),
      name: p.name,
      role: 'employee',
      country: p.country,
      employmentType: p.employmentType,
      department: p.department,
      jobTitle: p.jobTitle,
      accessLevel: p.accessLevel,
      queues: [],
      isDemo: false,
      createdAt: created,
    })),
    conversations: [],
    messages: [],
    turnTraces: [],
    feedback: [],
    tickets: [],
    ticketEvents: [],
    gapClusters: [],
  };

  const eligible = (s: HistoricScenario, u: UserDoc) =>
    (!s.audience?.countries || s.audience.countries.includes(u.country)) &&
    (!s.audience?.employmentTypes || s.audience.employmentTypes.includes(u.employmentType));
  const scenarioWeights = catalog.scenarios.map((s) => [s, s.weight] as [HistoricScenario, number]);
  const ticketNumbers = { IT: 5001, HR: 5001 };
  const gapTurns = new Map<string, { scenario: HistoricScenario; turns: TurnTraceDoc[] }>();

  for (let n = 0; n < HISTORIC_CONVERSATIONS; n++) {
    const scenario = weighted(scenarioWeights);
    const candidates = out.users.filter((u) => eligible(scenario, u));
    const user = pick(candidates.length > 0 ? candidates : out.users);
    const day = addDays(today, -1 - Math.floor(rand() * HISTORIC_DAYS));
    const at = new Date(
      `${day}T${String(8 + Math.floor(rand() * 10)).padStart(2, '0')}:${String(Math.floor(rand() * 60)).padStart(2, '0')}:00Z`,
    );
    const question = pick(scenario.questions);
    const key = `historic:${n}`;
    const conversationId = seedId(`${key}:conv`);
    const userMessageId = seedId(`${key}:msg:user`);
    const assistantId = seedId(`${key}:msg:assistant`);
    const answeredAt = new Date(at.getTime() + Math.round(between(2_000, 9_000)));
    const sensitive = scenario.decision === 'SENSITIVE_HANDOFF';

    // Retrieval: real chunks of the scenario's documents when the index has them.
    const chunks = scenario.docSlugs.flatMap((slug) => input.chunksBySlug?.get(slug) ?? []);
    const searched = !['SENSITIVE_HANDOFF', 'OUT_OF_SCOPE', 'CLARIFY'].includes(scenario.decision);
    const strong = scenario.decision === 'ANSWER' || scenario.reasonCode === 'ACTION_REQUIRED';
    const top = chunks.slice(0, 4);
    const coverage: NonNullable<TurnTraceDoc['retrieval']>['coverage'] =
      scenario.decision === 'PARTIAL' ? 'partial' : top.length === 0 ? 'none' : 'full';
    const llm = (node: string, promptName: string, version: number, tier: 'fast' | 'quality') => {
      const inputTokens = Math.round(between(600, 2400));
      const outputTokens = Math.round(between(60, tier === 'quality' ? 420 : 160));
      return {
        node,
        promptName,
        promptVersion: version,
        promptHash: `historic${promptName.length}${version}`,
        provider: 'gemini',
        model: tier === 'quality' ? 'gemini-2.5-flash' : 'gemini-2.5-flash-lite',
        inputTokens,
        outputTokens,
        costUsd: Number(((inputTokens * 0.1 + outputTokens * 0.4) / 1_000_000).toFixed(6)),
        latencyMs: Math.round(between(500, tier === 'quality' ? 4_000 : 1_600)),
        retries: 0,
        error: null,
      };
    };
    const llmCalls = sensitive
      ? []
      : [
          llm('analyzeTurn', 'turn_analysis', 2, 'fast'),
          ...(searched && top.length > 0 ? [llm('rerankAssess', 'rerank_assess', 1, 'fast')] : []),
          ...(['ANSWER', 'PARTIAL'].includes(scenario.decision)
            ? [llm('generateAnswer', 'grounded_answer', 1, 'quality')]
            : scenario.decision === 'CLARIFY'
              ? [llm('clarify', 'clarifying_question', 1, 'fast')]
              : []),
        ];
    const totalLatencyMs = Math.max(
      answeredAt.getTime() - at.getTime(),
      llmCalls.reduce((sum, c) => sum + c.latencyMs, 0) + 120,
    );
    const citations = scenario.answer.includes('[S1]') && top[0] ? ['S1'] : [];

    const trace: TurnTraceDoc = {
      _id: seedId(`${key}:trace`),
      messageId: assistantId,
      conversationId,
      userId: user._id,
      graphRunId: `historic-${n}`,
      redactedInput: question,
      profileSnapshot: {
        country: user.country,
        employmentType: user.employmentType,
        accessLevel: user.accessLevel,
        department: user.department,
      },
      precheck: {
        sensitiveHit: sensitive,
        safetyHit: Boolean(scenario.safety),
        matchedRules: [scenario.safety, scenario.sensitive].filter((r): r is string => !!r),
      },
      analysis: sensitive
        ? null
        : {
            intent: scenario.decision === 'ESCALATE' ? 'report_issue' : 'question',
            domain: scenario.domain,
            category: scenario.category,
            urgency: scenario.ticket?.aiUrgency ?? scenario.ticket?.priority ?? 'low',
            sensitivity: 'none',
            ambiguity: scenario.decision === 'CLARIFY' ? 'high' : 'low',
            searchQuery: question.toLowerCase().replace(/[?.!]/g, ''),
            workspaceIntent: 'none',
          },
      retrieval: searched
        ? {
            query: question.toLowerCase().replace(/[?.!]/g, ''),
            filter: {
              status: 'active',
              countries: user.country,
              employmentTypes: user.employmentType,
            },
            vector: top.map((chunkId, i) => ({
              chunkId,
              score: Number((0.86 - i * 0.04).toFixed(3)),
              rank: i + 1,
            })),
            keyword: top.map((chunkId, i) => ({
              chunkId,
              score: Number((9.2 - i * 1.3).toFixed(2)),
              rank: i + 1,
            })),
            fused: top.map((chunkId, i) => ({
              chunkId,
              score: Number((0.033 - i * 0.002).toFixed(4)),
              rank: i + 1,
            })),
            reranked: top.slice(0, 3).map((chunkId, i) => ({
              chunkId,
              relevance: strong ? 3 - i : Math.max(1, 2 - i),
            })),
            coverage,
          }
        : null,
      decision: {
        value: scenario.decision,
        reasonCode: scenario.reasonCode,
        rulesFired: [
          ...(scenario.safety ? ['safety'] : []),
          ...(sensitive ? ['sensitive'] : []),
          scenario.reasonCode.toLowerCase(),
        ].filter((r, i, all) => all.indexOf(r) === i),
        thresholds: { answerMinRelevance: 2, partialMinRelevance: 1 },
      },
      output: {
        citationsProposed: citations,
        citationsValid: citations,
        citationsRejected: [],
        numericViolations: [],
        withdrawn: false,
      },
      llmCalls,
      stepLatencyMs: {
        precheck: Math.round(between(1, 6)),
        ...(llmCalls[0] && { analyzeTurn: llmCalls[0].latencyMs }),
        ...(searched && { retrieve: Math.round(between(80, 400)) }),
      },
      totalLatencyMs,
      ttftMs: ['ANSWER', 'PARTIAL'].includes(scenario.decision)
        ? Math.round(between(700, 2_600))
        : null,
      totalCostUsd: Number(llmCalls.reduce((sum, c) => sum + c.costUsd, 0).toFixed(6)),
      errors: [],
      restricted: sensitive,
      isEval: false,
      createdAt: answeredAt,
    };
    out.turnTraces.push(trace);

    out.messages.push(
      {
        _id: userMessageId,
        conversationId,
        role: 'user',
        content: question,
        decision: null,
        reasonCode: null,
        citations: [],
        uncovered: [],
        ticketDraft: null,
        status: 'complete',
        isEval: false,
        createdAt: at,
      },
      {
        _id: assistantId,
        conversationId,
        role: 'assistant',
        content: citations.length > 0 ? scenario.answer : scenario.answer.replace(/ ?\[S1\]/g, ''),
        decision: scenario.decision,
        reasonCode: scenario.reasonCode,
        citations: [],
        uncovered: scenario.uncovered ?? [],
        ticketDraft: null,
        status: 'complete',
        isEval: false,
        createdAt: answeredAt,
      },
    );

    // Outcome: resolution for answers, a ticket for most escalations, feedback on some answers.
    let status: ConversationDoc['status'] = 'open';
    let resolution: ConversationDoc['resolution'] = null;
    let ticketId: ObjectId | null = null;
    if (scenario.decision === 'ANSWER' && rand() < 0.6) {
      status = 'resolved';
      resolution = {
        confirmed: true,
        at: new Date(answeredAt.getTime() + 60_000),
        messageId: assistantId,
      };
    }
    if (scenario.ticket && (scenario.decision !== 'ESCALATE' || rand() < 0.85)) {
      const t = scenario.ticket;
      const domain = scenario.domain;
      const humanId = `${domain}-${ticketNumbers[domain]++}`;
      ticketId = seedId(`${key}:ticket`);
      const queue = sensitive ? routing.sensitiveQueue : routing.routes[scenario.category]!;
      let ticketStatus = weighted(TICKET_STATUS_WEIGHTS);
      // Keep the E2E queue filter for HR-9002 (waiting, low, payroll) unambiguous.
      if (ticketStatus === 'waiting_on_employee' && t.priority === 'low')
        ticketStatus = 'in_progress';
      const agent = domain === 'IT' ? agents.it : agents.hr;
      const openedAt = new Date(answeredAt.getTime() + 90_000);
      const updatedAt = new Date(
        Math.min(
          openedAt.getTime() + between(2, 60) * 3_600_000,
          new Date(`${today}T07:00:00Z`).getTime(),
        ),
      );
      status = sensitive ? 'handed_off' : 'escalated';
      out.tickets.push({
        _id: ticketId,
        humanId,
        conversationId,
        requesterId: user._id,
        requesterSnapshot: {
          name: user.name,
          email: user.email,
          country: user.country,
          employmentType: user.employmentType,
          department: user.department,
        },
        domain,
        category: scenario.category,
        subcategory: null,
        queue,
        priority: t.priority,
        aiUrgency: t.aiUrgency ?? t.priority,
        priorityFloorApplied: t.floor ?? null,
        status: ticketStatus,
        summary: sensitive
          ? t.summary
          : `${t.summary}: ${question.replace(/[?.!]+$/, '')}`.slice(0, 120),
        agentBrief: sensitive
          ? ''
          : `${user.name} asked: "${question}". ${scenario.answer.replace(/ ?\[S1\]/g, '')}`,
        agentAssist: null,
        fields: t.fields,
        aiFilledFields: Object.keys(t.fields),
        articlesShown: [],
        restricted: sensitive,
        duplicateOf: null,
        isEval: false,
        synthetic: true,
        createdAt: openedAt,
        updatedAt,
        resolvedAt: ticketStatus === 'resolved' ? updatedAt : null,
      });
      const event = (suffix: string, e: Omit<TicketEventDoc, '_id' | 'ticketId'>) =>
        out.ticketEvents.push({ _id: seedId(`${key}:ev:${suffix}`), ticketId: ticketId!, ...e });
      event('created', {
        actorId: user._id,
        type: 'created',
        visibility: 'public',
        body: null,
        field: null,
        oldValue: null,
        newValue: null,
        createdAt: openedAt,
      });
      if (ticketStatus !== 'new') {
        event('status', {
          actorId: agent._id,
          type: 'status_change',
          visibility: 'public',
          body: null,
          field: null,
          oldValue: 'new',
          newValue: ticketStatus,
          createdAt: updatedAt,
        });
        event('reply', {
          actorId: agent._id,
          type: 'reply',
          visibility: 'public',
          body:
            ticketStatus === 'resolved'
              ? 'This is sorted now. Reply here if anything is still not right.'
              : 'Thanks, we are looking into this and will update you here.',
          field: null,
          oldValue: null,
          newValue: null,
          createdAt: updatedAt,
        });
      }
      // About one ticket in six: the agent corrects the AI's priority (override rate).
      if (!sensitive && !t.floor && rand() < 0.18) {
        const corrected = t.priority === 'low' ? 'medium' : 'low';
        out.tickets[out.tickets.length - 1]!.priority = corrected;
        event('correction', {
          actorId: agent._id,
          type: 'classification_correction',
          visibility: 'internal',
          body: 'Adjusted after reading the details.',
          field: 'priority',
          oldValue: t.priority,
          newValue: corrected,
          createdAt: new Date(openedAt.getTime() + 1_800_000),
        });
      }
    }
    if (['ANSWER', 'PARTIAL'].includes(scenario.decision) && rand() < 0.45) {
      out.feedback.push({
        _id: seedId(`${key}:feedback`),
        messageId: assistantId,
        conversationId,
        userId: user._id,
        rating:
          scenario.decision === 'PARTIAL'
            ? rand() < 0.6
              ? 'down'
              : 'up'
            : rand() < 0.88
              ? 'up'
              : 'down',
        createdAt: new Date(answeredAt.getTime() + 30_000),
      });
    }

    out.conversations.push({
      _id: conversationId,
      userId: user._id,
      title: question.length > 60 ? `${question.slice(0, 57)}...` : question,
      status,
      resolution,
      ticketId,
      restricted: sensitive,
      lastDecision: scenario.decision,
      turnCount: 1,
      isEval: false,
      synthetic: true,
      createdAt: at,
      updatedAt: answeredAt,
    });

    if (scenario.gap) {
      const entry = gapTurns.get(scenario.gap.label) ?? { scenario, turns: [] };
      entry.turns.push(trace);
      gapTurns.set(scenario.gap.label, entry);
    }
  }

  // Knowledge gaps: a ready-made snapshot over the historic gap turns (no embeddings).
  const snapshotAt = new Date(`${today}T06:00:00Z`);
  for (const [label, { scenario, turns }] of gapTurns) {
    if (turns.length < 2) continue;
    const examples = turns.slice(0, 10);
    out.gapClusters.push({
      _id: seedId(`historic:gap:${scenario.key}`),
      snapshotAt,
      rangeFrom: addDays(today, -HISTORIC_DAYS),
      rangeTo: addDays(today, -1),
      label,
      labelled: true,
      domain: scenario.gap!.domain,
      questionCount: turns.length,
      exampleQuestions: examples.map((t) => t.redactedInput),
      messageIds: turns.map((t) => t.messageId),
      conversationIds: turns.map((t) => t.conversationId),
    });
  }
  out.gapClusters.sort((a, b) => b.questionCount - a.questionCount);
  return out;
}

// --- writing ---------------------------------------------------------------------

export interface HistoricCollections {
  users: Collection<UserDoc>;
  conversations: Collection<ConversationDoc>;
  messages: Collection<MessageDoc>;
  turnTraces: Collection<TurnTraceDoc>;
  feedback: Collection<FeedbackDoc>;
  tickets: Collection<TicketDoc>;
  ticketEvents: Collection<TicketEventDoc>;
  gapClusters: Collection<GapClusterDoc>;
  emailOutbox: Collection<EmailOutboxDoc>;
}

/**
 * Writes the historic data: each record is replaced by its stable id (validated),
 * so running it twice gives the same result; the gap snapshot replaces any other.
 */
export async function applyHistoric(
  c: HistoricCollections,
  data: HistoricData,
): Promise<Record<string, number>> {
  const replace = async <T extends { _id: ObjectId }>(
    name: string,
    collection: Collection<T>,
    schema: z.ZodType,
    docs: T[],
  ) => {
    const valid = docs.map((d) => validateForWrite(name, schema, d) as T);
    const ids = valid.map((d) => d._id);
    await collection.deleteMany({ _id: { $in: ids } } as never);
    if (valid.length > 0) await collection.insertMany(valid as never[], { ordered: true });
    return valid.length;
  };
  const counts = {
    users: await replace('users', c.users, UserSchema, data.users),
    conversations: await replace(
      'conversations',
      c.conversations,
      ConversationSchema,
      data.conversations,
    ),
    messages: await replace('messages', c.messages, MessageSchema, data.messages),
    turnTraces: await replace('turn_traces', c.turnTraces, TurnTraceSchema, data.turnTraces),
    feedback: await replace('feedback', c.feedback, FeedbackSchema, data.feedback),
    tickets: await replace('tickets', c.tickets, TicketSchema, data.tickets),
    ticketEvents: await replace(
      'ticket_events',
      c.ticketEvents,
      TicketEventSchema,
      data.ticketEvents,
    ),
    gapClusters: 0,
  };
  await c.gapClusters.deleteMany({});
  counts.gapClusters = await replace(
    'gap_clusters',
    c.gapClusters,
    GapClusterSchema,
    data.gapClusters,
  );
  return counts;
}

/**
 * Clears what demo runs left behind (W4-08 reset): every non-evaluation
 * conversation and ticket that is neither seeded nor historic, with their
 * messages, traces, feedback, events and emails. Evaluation data and the audit
 * log are kept.
 */
export async function clearDemoRuns(
  c: HistoricCollections & { checkpoints?: Collection; checkpointWrites?: Collection },
  keep: { conversationIds: ObjectId[]; ticketIds: ObjectId[]; ticketEventIds: ObjectId[] },
): Promise<{ conversations: number; tickets: number }> {
  const stale = await c.conversations
    .find({ isEval: false, _id: { $nin: keep.conversationIds } }, { projection: { _id: 1 } })
    .toArray();
  const ids = stale.map((s) => s._id);
  if (ids.length > 0) {
    await c.messages.deleteMany({ conversationId: { $in: ids } });
    await c.turnTraces.deleteMany({ conversationId: { $in: ids } });
    await c.feedback.deleteMany({ conversationId: { $in: ids } });
    const threads = ids.map((id) => id.toHexString());
    await c.checkpoints?.deleteMany({ thread_id: { $in: threads } });
    await c.checkpointWrites?.deleteMany({ thread_id: { $in: threads } });
    await c.conversations.deleteMany({ _id: { $in: ids } });
  }
  const extraTickets = await c.tickets
    .find({ isEval: false, _id: { $nin: keep.ticketIds } }, { projection: { _id: 1 } })
    .toArray();
  const ticketIds = extraTickets.map((t) => t._id);
  await c.emailOutbox.deleteMany({ ticketId: { $in: ticketIds } });
  await c.ticketEvents.deleteMany({
    $or: [
      { ticketId: { $in: ticketIds } },
      { ticketId: { $in: keep.ticketIds }, _id: { $nin: keep.ticketEventIds } },
    ],
  });
  await c.tickets.deleteMany({ _id: { $in: ticketIds } });
  return { conversations: ids.length, tickets: ticketIds.length };
}
