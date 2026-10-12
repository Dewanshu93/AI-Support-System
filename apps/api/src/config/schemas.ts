import { DOMAINS, PRIORITIES } from '@sd/shared';
import { z } from 'zod';

// One Zod schema per config/*.yaml file. Objects are strict so a typo in a
// key fails startup instead of being silently ignored.

const Id = z.string().regex(/^[a-z][a-z0-9_]*$/, 'must be lower_snake_case');
const Label = z.string().trim().min(1);
const Version = z.literal(1);
const Domain = z.enum(DOMAINS);
const Priority = z.enum(PRIORITIES);
/** Rerank relevance scale used by P-2 (0 = irrelevant … 3 = directly answers). */
const Relevance = z.number().min(0).max(3);
const PositiveInt = z.number().int().positive();

const RegexPattern = z
  .string()
  .min(1)
  .refine((pattern) => {
    try {
      new RegExp(pattern, 'i');
      return true;
    } catch {
      return false;
    }
  }, 'is not a valid regular expression');

/** Adds an issue for every repeated `key` value in `items`. */
function requireUnique<T>(
  items: readonly T[],
  key: (item: T) => string,
  ctx: z.RefinementCtx,
  path: (string | number)[],
) {
  const seen = new Set<string>();
  items.forEach((item, index) => {
    const value = key(item);
    if (seen.has(value)) {
      ctx.addIssue({ code: 'custom', path: [...path, index], message: `duplicate id "${value}"` });
    }
    seen.add(value);
  });
}

// --- taxonomy.yaml ---------------------------------------------------------

export const TaxonomySchema = z
  .strictObject({
    version: Version,
    categories: z
      .array(
        z.strictObject({
          id: Id,
          domain: Domain,
          label: Label,
          subcategories: z.array(z.strictObject({ id: Id, label: Label })).min(1),
        }),
      )
      .min(1),
  })
  .superRefine((taxonomy, ctx) => {
    requireUnique(taxonomy.categories, (c) => c.id, ctx, ['categories']);
    taxonomy.categories.forEach((category, index) =>
      requireUnique(category.subcategories, (s) => s.id, ctx, [
        'categories',
        index,
        'subcategories',
      ]),
    );
  });

// --- routing.yaml ----------------------------------------------------------

export const RoutingSchema = z
  .strictObject({
    version: Version,
    queues: z
      .array(
        z.strictObject({
          id: Id,
          domain: Domain,
          label: Label,
          /** Where escalation emails go (UC-07); a queue without one gets no email. */
          email: z.email().optional(),
        }),
      )
      .min(1),
    sensitiveQueue: Id,
    routes: z.record(Id, Id),
  })
  .superRefine((routing, ctx) => {
    requireUnique(routing.queues, (q) => q.id, ctx, ['queues']);
    const queueIds = new Set(routing.queues.map((q) => q.id));
    if (!queueIds.has(routing.sensitiveQueue)) {
      ctx.addIssue({
        code: 'custom',
        path: ['sensitiveQueue'],
        message: `unknown queue "${routing.sensitiveQueue}"`,
      });
    }
    for (const [category, queue] of Object.entries(routing.routes)) {
      if (!queueIds.has(queue)) {
        ctx.addIssue({
          code: 'custom',
          path: ['routes', category],
          message: `unknown queue "${queue}"`,
        });
      }
    }
  });

// --- priority-rules.yaml ---------------------------------------------------

export const PriorityRulesSchema = z
  .strictObject({
    version: Version,
    floors: z.array(
      z.discriminatedUnion('kind', [
        z.strictObject({
          id: Id,
          kind: z.literal('safety'),
          floor: Priority,
          patterns: z.array(RegexPattern).min(1),
        }),
        z.strictObject({
          id: Id,
          kind: z.literal('impact'),
          floor: Priority,
          impactScope: z.enum(['me', 'team', 'org']),
        }),
      ]),
    ),
  })
  .superRefine((rules, ctx) => requireUnique(rules.floors, (f) => f.id, ctx, ['floors']));

// --- sensitive.yaml --------------------------------------------------------

export const SENSITIVE_TOPICS = [
  'harassment',
  'discrimination',
  'medical',
  'legal',
  'grievance',
  'wellbeing',
] as const;

export const SensitiveSchema = z
  .strictObject({
    version: Version,
    rules: z
      .array(
        z.strictObject({
          id: Id,
          topic: z.enum(SENSITIVE_TOPICS),
          patterns: z.array(RegexPattern).min(1),
        }),
      )
      .min(1),
  })
  .superRefine((sensitive, ctx) => requireUnique(sensitive.rules, (r) => r.id, ctx, ['rules']));

// --- thresholds.yaml -------------------------------------------------------

export const ThresholdsSchema = z
  .strictObject({
    version: Version,
    decision: z.strictObject({
      answerMinRelevance: Relevance,
      partialMinRelevance: Relevance,
    }),
    retrieval: z.strictObject({
      vectorNumCandidates: PositiveInt,
      vectorLimit: PositiveInt,
      keywordLimit: PositiveInt,
      rrfK: PositiveInt,
      fusedTopK: PositiveInt,
      contextTopK: PositiveInt,
      contextMinRelevance: Relevance,
    }),
    conversation: z.strictObject({ historyMessages: z.number().int().min(1).max(50) }),
    ticket: z.strictObject({
      maxClarifyRounds: z.number().int().min(0).max(5),
      duplicateWindowDays: z.number().int().min(1).max(90),
    }),
  })
  .superRefine((t, ctx) => {
    const fail = (path: string[], message: string) =>
      ctx.addIssue({ code: 'custom', path, message });
    if (t.decision.partialMinRelevance > t.decision.answerMinRelevance) {
      fail(['decision', 'partialMinRelevance'], 'must not exceed answerMinRelevance');
    }
    if (t.retrieval.vectorNumCandidates < t.retrieval.vectorLimit) {
      fail(['retrieval', 'vectorNumCandidates'], 'must be at least vectorLimit');
    }
    if (t.retrieval.fusedTopK > t.retrieval.vectorLimit + t.retrieval.keywordLimit) {
      fail(['retrieval', 'fusedTopK'], 'must not exceed vectorLimit + keywordLimit');
    }
    if (t.retrieval.contextTopK > t.retrieval.fusedTopK) {
      fail(['retrieval', 'contextTopK'], 'must not exceed fusedTopK');
    }
  });

// --- ticket-schemas.yaml ---------------------------------------------------

export const TicketSchemasSchema = z
  .strictObject({
    version: Version,
    schemas: z.record(
      Id,
      z.strictObject({
        fields: z.array(z.strictObject({ key: Id, description: Label, required: z.boolean() })),
      }),
    ),
  })
  .superRefine((file, ctx) => {
    for (const [category, schema] of Object.entries(file.schemas)) {
      requireUnique(schema.fields, (f) => f.key, ctx, ['schemas', category, 'fields']);
    }
  });

// --- prompts.yaml ----------------------------------------------------------

export const PROMPT_NAMES = [
  'turn_analysis',
  'rerank_assess',
  'grounded_answer',
  'clarifying_question',
  'ticket_slot_fill',
  'agent_ticket_summary',
  'agent_draft_reply',
  'gap_cluster_label',
  'eval_judge',
  // Build Contract v2.0 (ADR-015): P-10, copilot timesheet entries.
  'timesheet_extract',
  // P-11, the payroll agent's explanation (UC-06).
  'payroll_explain',
] as const;
export type PromptName = (typeof PROMPT_NAMES)[number];

export const PromptsSchema = z.strictObject({
  version: Version,
  active: z
    .strictObject(
      Object.fromEntries(PROMPT_NAMES.map((name) => [name, PositiveInt])) as Record<
        PromptName,
        typeof PositiveInt
      >,
    )
    // Only prompts built so far are listed; each listed prompt must have its file.
    .partial()
    .refine((active) => Object.keys(active).length > 0, 'at least one prompt must be active'),
});

// --- models.yaml -----------------------------------------------------------

/** `ollama`: a local model through Ollama's OpenAI-compatible API (ADR-018, development fallback). */
export const CHAT_PROVIDERS = ['gemini', 'openrouter', 'ollama'] as const;
const ModelId = z.string().trim().min(1);
const ModelTiers = z.strictObject({ fast: ModelId, quality: ModelId });

export const MODEL_TIERS = ['fast', 'quality'] as const;
/** USD per 1M tokens; output is optional for embedding models. */
const ModelCost = z.strictObject({
  input: z.number().min(0),
  output: z.number().min(0).optional(),
});

export const ModelsSchema = z
  .strictObject({
    version: Version,
    chat: z.strictObject({
      provider: z.enum(CHAT_PROVIDERS),
      /**
       * Tried in order when the provider is out of quota or credit, rejects its
       * key or is unreachable (ADR-018). API server only; evals and the smoke
       * test always use `provider`.
       */
      fallbacks: z.array(z.enum(CHAT_PROVIDERS)).optional(),
      // Every provider is always configured so switching is a one-line change.
      models: z.strictObject({ gemini: ModelTiers, openrouter: ModelTiers, ollama: ModelTiers }),
    }),
    embeddings: z.strictObject({
      // D-2: do not assume OpenRouter serves embeddings.
      provider: z.enum(['gemini']),
      model: ModelId,
      dimension: z.number().int().min(64).max(4096),
    }),
    /** Per-call policy applied to every LLM and embedding call. */
    call: z.strictObject({
      timeoutMs: z.number().int().min(1000).max(300_000),
      /**
       * A longer per-attempt budget for a slow provider in the fallback chain
       * (ADR-018: a local Ollama model on CPU). API server only.
       */
      providerTimeoutMs: z
        .partialRecord(z.enum(CHAT_PROVIDERS), z.number().int().min(1000).max(300_000))
        .optional(),
      maxRetries: z.number().int().min(0).max(5),
      /** Output cap per chat call; also stops OpenRouter reserving credit for the model maximum. */
      maxOutputTokens: z.number().int().min(64).max(65_536),
    }),
    /** Cost table keyed by model ID (USD per 1M tokens). */
    costs: z.record(ModelId, ModelCost),
  })
  .superRefine((m, ctx) => {
    const fallbacks = m.chat.fallbacks ?? [];
    if (fallbacks.includes(m.chat.provider) || new Set(fallbacks).size !== fallbacks.length) {
      ctx.addIssue({
        code: 'custom',
        path: ['chat', 'fallbacks'],
        message: 'list each fallback provider once, and not the main provider',
      });
    }
    const chatModels = Object.values(m.chat.models).flatMap((tiers) => Object.values(tiers));
    for (const model of chatModels) {
      if (m.costs[model]?.output === undefined) {
        ctx.addIssue({
          code: 'custom',
          path: ['costs', model],
          message: 'chat model needs input and output costs',
        });
      }
    }
    if (!m.costs[m.embeddings.model]) {
      ctx.addIssue({
        code: 'custom',
        path: ['costs', m.embeddings.model],
        message: 'embedding model needs an input cost',
      });
    }
  });

// --- templates.yaml --------------------------------------------------------

/** Placeholders each template must contain; code fills them in. */
export const TEMPLATE_PLACEHOLDERS = {
  out_of_scope: [],
  sensitive_handoff: ['contact'],
  sensitive_contact: [],
  withdrawn_answer: ['domain'],
  ticket_confirmed: ['ticketHumanId', 'queueLabel'],
  generic_error: [],
  clarify_generic: [],
  resolution_declined: [],
  ticket_draft_ready: ['queueLabel'],
  ticket_fields_question: ['fields'],
  ticket_cancelled: [],
  ticket_linked: ['ticketHumanId'],
  restricted_case_summary: [],
  restricted_case_description: [],
  // Escalation email (UC-07)
  email_greeting: ['queueLabel'],
  email_sign_off: ['employeeName', 'department'],
  email_request_lop: ['dates'],
  email_request_default: [],
  email_records_unavailable: [],
  email_draft_ready: ['queueLabel'],
  email_recorded: ['queueLabel', 'ticketHumanId'],
  email_failed: ['ticketHumanId'],
} as const satisfies Record<string, readonly string[]>;
export type TemplateName = keyof typeof TEMPLATE_PLACEHOLDERS;

export const TemplatesSchema = z
  .strictObject({
    version: Version,
    templates: z.strictObject(
      Object.fromEntries(Object.keys(TEMPLATE_PLACEHOLDERS).map((name) => [name, Label])) as Record<
        TemplateName,
        typeof Label
      >,
    ),
  })
  .superRefine((file, ctx) => {
    for (const [name, placeholders] of Object.entries(TEMPLATE_PLACEHOLDERS)) {
      const text = file.templates[name as TemplateName];
      for (const placeholder of placeholders) {
        if (!text.includes(`{${placeholder}}`)) {
          ctx.addIssue({
            code: 'custom',
            path: ['templates', name],
            message: `must contain the placeholder {${placeholder}}`,
          });
        }
      }
    }
  });

// --- workday.yaml (UC-01) --------------------------------------------------

const IsoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'must be YYYY-MM-DD')
  .refine((d) => !Number.isNaN(Date.parse(`${d}T00:00:00Z`)), 'is not a real date');

export const WorkdaySchema = z
  .strictObject({
    version: Version,
    timesheet: z.strictObject({
      requiredHoursPerDay: z.number().positive().max(24),
      maxHoursPerDay: z.number().positive().max(24),
      hourStep: z.number().positive().max(1),
      maxBackDays: z.number().int().min(1).max(366),
    }),
    holidays: z.strictObject({
      US: z.array(z.strictObject({ date: IsoDate, name: Label })),
      UK: z.array(z.strictObject({ date: IsoDate, name: Label })),
    }),
  })
  .superRefine((w, ctx) => {
    if (w.timesheet.requiredHoursPerDay > w.timesheet.maxHoursPerDay) {
      ctx.addIssue({
        code: 'custom',
        path: ['timesheet', 'requiredHoursPerDay'],
        message: 'must not exceed maxHoursPerDay',
      });
    }
    for (const country of ['US', 'UK'] as const) {
      requireUnique(w.holidays[country], (h) => h.date, ctx, ['holidays', country]);
    }
  });

/** Every config file, its schema, and the key it is exposed under on AppConfig. */
export const CONFIG_FILES = {
  taxonomy: { file: 'taxonomy.yaml', schema: TaxonomySchema },
  routing: { file: 'routing.yaml', schema: RoutingSchema },
  priorityRules: { file: 'priority-rules.yaml', schema: PriorityRulesSchema },
  sensitive: { file: 'sensitive.yaml', schema: SensitiveSchema },
  thresholds: { file: 'thresholds.yaml', schema: ThresholdsSchema },
  ticketSchemas: { file: 'ticket-schemas.yaml', schema: TicketSchemasSchema },
  prompts: { file: 'prompts.yaml', schema: PromptsSchema },
  models: { file: 'models.yaml', schema: ModelsSchema },
  templates: { file: 'templates.yaml', schema: TemplatesSchema },
  workday: { file: 'workday.yaml', schema: WorkdaySchema },
} as const;

export type ConfigFiles = {
  [K in keyof typeof CONFIG_FILES]: z.output<(typeof CONFIG_FILES)[K]['schema']>;
};
