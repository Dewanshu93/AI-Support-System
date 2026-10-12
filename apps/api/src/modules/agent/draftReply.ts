// Agent draft reply (W3-06): gathers what the draft may rely on (the ticket, the
// agent brief and the policy passages the employee was shown), asks the injected
// P-7 function for a draft, and records it as an internal ai_draft_generated
// event with the LLM call. The draft is returned to the agent only: sending is
// the agent's own reply (POST …/replies, usedAiDraft on the audit entry).
import type { AuthUser } from '@sd/shared';
import { ObjectId } from 'mongodb';
import type { DraftReplyFn, DraftSource, DraftTone } from '../../ai/nodes/draftReply';
import type { TicketDoc } from '../../db/schemas';
import { AppError } from '../../lib/errors';
import type { ConversationsRepository } from '../conversations/repository';
import type { SourcesReader } from '../documents/repository';
import type { TicketsRepository } from '../tickets/repository';
import type { AgentService } from './service';

/** At most this many cited passages go to the model. */
export const MAX_DRAFT_SOURCES = 5;

export interface DraftReplyServiceDeps {
  agent: Pick<AgentService, 'getVisible'>;
  tickets: Pick<TicketsRepository, 'insertEvent'>;
  conversations: Pick<ConversationsRepository, 'listMessages'>;
  sources: Pick<SourcesReader, 'findChunk'>;
  draft: DraftReplyFn;
  now?: () => Date;
}

/** The ticket as P-7 sees it: the employee's first name for the greeting, never contact details. */
export function formatTicketForDraft(ticket: TicketDoc): string {
  const fields = Object.entries(ticket.fields)
    .map(([key, value]) => `- ${key}: ${value}`)
    .join('\n');
  return [
    `Employee first name: ${ticket.requesterSnapshot.name.split(/\s+/)[0] ?? ''}`,
    `Request ${ticket.humanId}: ${ticket.summary}`,
    `Category: ${ticket.category}${ticket.subcategory ? ` / ${ticket.subcategory}` : ''}; status: ${ticket.status}`,
    fields ? `Fields:\n${fields}` : 'Fields: (none)',
  ].join('\n');
}

export function createDraftReplyService(deps: DraftReplyServiceDeps) {
  const now = deps.now ?? (() => new Date());

  /** The distinct cited passages shown in the conversation, most recent first. */
  async function shownSources(ticket: TicketDoc): Promise<DraftSource[]> {
    const messages = await deps.conversations.listMessages(ticket.conversationId);
    const seen = new Map<string, string>();
    for (const m of [...messages].reverse()) {
      for (const c of m.citations) {
        const id = c.chunkId.toHexString();
        if (!seen.has(id)) seen.set(id, c.docTitle);
      }
    }
    const ids = [...seen.keys()].slice(0, MAX_DRAFT_SOURCES);
    const chunks = await Promise.all(ids.map((id) => deps.sources.findChunk(id)));
    return chunks.flatMap((chunk, i) =>
      chunk
        ? [
            {
              documentId: chunk.documentId.toHexString(),
              docTitle: seen.get(ids[i]!)!,
              sectionPath: chunk.sectionPath,
              text: chunk.text,
            },
          ]
        : [],
    );
  }

  return {
    async generate(id: string, viewer: AuthUser, tone: DraftTone) {
      const ticket = await deps.agent.getVisible(id, viewer);
      // Sensitive topics bypass the AI (Build Contract v2.0 rule E.6).
      if (ticket.restricted) {
        throw new AppError('CONFLICT', 'AI drafts are not available for confidential cases');
      }
      const sources = await shownSources(ticket);
      const outcome = await deps.draft({
        ticket: formatTicketForDraft(ticket),
        brief: ticket.agentBrief || '(no brief)',
        sources,
        tone,
      });
      if (!outcome.draft) {
        throw new AppError(
          'LLM_UNAVAILABLE',
          'The AI draft is not available right now; write the reply yourself or try again',
        );
      }
      const docTitle = new Map(sources.map((s) => [s.documentId, s.docTitle]));
      const citedDocuments = outcome.draft.citedDocumentIds.map((documentId) => ({
        documentId,
        docTitle: docTitle.get(documentId)!,
      }));
      // Logged as an internal event: what the AI proposed, with its call metadata.
      await deps.tickets.insertEvent({
        _id: new ObjectId(),
        ticketId: ticket._id,
        actorId: new ObjectId(viewer.id),
        type: 'ai_draft_generated',
        visibility: 'internal',
        body: outcome.draft.body,
        field: null,
        oldValue: null,
        newValue: null,
        llmCall: outcome.llmCalls.at(-1),
        createdAt: now(),
      });
      return {
        ticket,
        draft: { body: outcome.draft.body, citedDocuments },
        promptVersion: outcome.promptVersion,
      };
    },
  };
}

export type DraftReplyService = ReturnType<typeof createDraftReplyService>;
