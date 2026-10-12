// Agent draft reply (AI, P-7 agent_draft_reply; W3-06). On demand, outside the
// turn graph (playbook: a direct chain): the agent asks for a first reply, edits
// it and sends it themselves; nothing here sends anything. Code keeps only the
// cited documents that were given to the model. modules/agent calls this through
// an injected function, so modules never import ai/llm (CLAUDE.md boundaries).
import type { TurnTraceDoc } from '../../db/schemas';
import type { CallPolicy, ChatHandle, CostTable, ModelTier } from '../llm';
import type { PromptRegistry } from '../prompts/registry';
import { AgentDraftReplySchema } from '../schemas';
import { llmCallDoc } from './persist';
import { structuredCallWithRetry } from './structuredCall';

export const DRAFT_TONES = {
  standard: 'standard: friendly, clear and complete; a short greeting, the answer, next steps',
  brief: 'brief: two or three short sentences; the answer and the next step only',
} as const;
export type DraftTone = keyof typeof DRAFT_TONES;

/** A policy passage the employee was shown in the conversation. */
export interface DraftSource {
  documentId: string;
  docTitle: string;
  sectionPath: string[];
  text: string;
}

export interface DraftReplyInput {
  /** The ticket as the model sees it (built by the caller). */
  ticket: string;
  brief: string;
  sources: DraftSource[];
  tone: DraftTone;
}

export interface DraftReplyOutcome {
  /** Null when the model failed twice or the provider failed: the caller returns 503. */
  draft: { body: string; citedDocumentIds: string[] } | null;
  promptVersion: number;
  /** Every attempt, as stored on the ai_draft_generated event. */
  llmCalls: TurnTraceDoc['llmCalls'];
}

export type DraftReplyFn = (input: DraftReplyInput) => Promise<DraftReplyOutcome>;

export interface DraftReplyDeps {
  prompts: PromptRegistry;
  chatFor: (tier: ModelTier, options?: { temperature?: number }) => ChatHandle;
  policy: CallPolicy;
  costs: CostTable;
}

export function formatDraftSources(sources: DraftSource[]): string {
  if (sources.length === 0) return '(no documents)';
  return sources
    .map(
      (s) => `[document ${s.documentId}] ${s.docTitle} > ${s.sectionPath.join(' > ')}\n${s.text}`,
    )
    .join('\n\n');
}

export function createDraftReply(deps: DraftReplyDeps): DraftReplyFn {
  return async (input) => {
    const { prompt, messages } = await deps.prompts.render('agent_draft_reply', {
      ticket: input.ticket,
      brief: input.brief,
      sources: formatDraftSources(input.sources),
      tone: DRAFT_TONES[input.tone],
    });
    const { data, llmCalls } = await structuredCallWithRetry({
      node: 'draftReply',
      prompt,
      messages,
      schema: AgentDraftReplySchema,
      chat: deps.chatFor(prompt.modelTier, { temperature: prompt.temperature }),
      policy: deps.policy,
      costs: deps.costs,
    });
    // AI proposes, code decides: only documents that were given count as cited.
    const given = new Set(input.sources.map((s) => s.documentId));
    return {
      draft: data && {
        body: data.body,
        citedDocumentIds: [...new Set(data.citedDocumentIds)].filter((id) => given.has(id)),
      },
      promptVersion: prompt.version,
      llmCalls: llmCalls.map(llmCallDoc),
    };
  };
}
