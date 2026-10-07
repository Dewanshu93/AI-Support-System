// SSE events of the chat endpoints (playbook section 4). Each event is sent
// as `event: <type>` with `data: <JSON payload>`. Order on success:
// turn_started → status… → token… → citations | withdrawn → ticket_draft? | action_draft? →
// handoff? → done. On failure: … → error (the message is stored with status error).
import { z } from 'zod';
import { DecisionSchema } from '../enums';
import { CitationDtoSchema } from './conversations';
import { TicketDraftSchema } from './tickets';
import { TimesheetActionSchema } from './workspace';

export const CHAT_STAGES = ['analyzing', 'searching', 'writing', 'preparing_ticket'] as const;
export type ChatStage = (typeof CHAT_STAGES)[number];

export const ChatEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('turn_started'),
    data: z.object({ userMessageId: z.string(), assistantMessageId: z.string() }),
  }),
  z.object({ type: z.literal('status'), data: z.object({ stage: z.enum(CHAT_STAGES) }) }),
  z.object({ type: z.literal('token'), data: z.object({ text: z.string() }) }),
  z.object({
    type: z.literal('citations'),
    data: z.object({ items: z.array(CitationDtoSchema) }),
  }),
  z.object({
    type: z.literal('withdrawn'),
    data: z.object({ reason: z.string(), replacementText: z.string() }),
  }),
  z.object({
    type: z.literal('ticket_draft'),
    data: z.object({
      draft: TicketDraftSchema,
      missingFields: z.array(z.string()),
    }),
  }),
  /** A copilot action waiting for the employee's confirmation (UC-05). */
  z.object({
    type: z.literal('action_draft'),
    data: z.object({ action: TimesheetActionSchema }),
  }),
  z.object({
    type: z.literal('handoff'),
    data: z.object({
      kind: z.enum(['sensitive', 'out_of_scope']),
      text: z.string(),
      contact: z.string().optional(),
      ticketHumanId: z.string().optional(),
      /** Sensitive: show the one-click "Yes, contact me privately" offer. */
      offerPrivateContact: z.boolean().optional(),
    }),
  }),
  z.object({
    type: z.literal('done'),
    data: z.object({
      decision: DecisionSchema,
      reasonCode: z.string(),
      assistantMessageId: z.string(),
      latencyMs: z.number(),
    }),
  }),
  z.object({
    type: z.literal('error'),
    data: z.object({ code: z.string(), message: z.string(), retryable: z.boolean() }),
  }),
]);
export type ChatEvent = z.infer<typeof ChatEventSchema>;
export type ChatEventType = ChatEvent['type'];

/** Serialises one event in SSE wire format. */
export function formatSseEvent(event: ChatEvent): string {
  return `event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`;
}

/** Parses an SSE body (e.g. a test response or a fetch stream buffer) into events. */
export function parseSseEvents(body: string): ChatEvent[] {
  return body
    .split(/\n\n/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const type = /^event: (.+)$/m.exec(block)?.[1];
      const data = /^data: (.*)$/m.exec(block)?.[1];
      return ChatEventSchema.parse({ type, data: data ? JSON.parse(data) : {} });
    });
}
