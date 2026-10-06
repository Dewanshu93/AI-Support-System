import { type ChatEvent, ChatEventSchema, formatSseEvent, parseSseEvents } from './chat-events';
import { PostMessageRequestSchema } from './conversations';

describe('chat events', () => {
  const events: ChatEvent[] = [
    { type: 'turn_started', data: { userMessageId: 'u', assistantMessageId: 'a' } },
    { type: 'status', data: { stage: 'searching' } },
    { type: 'token', data: { text: 'Hello\nworld' } },
    {
      type: 'done',
      data: {
        decision: 'ANSWER',
        reasonCode: 'EVIDENCE_STRONG',
        assistantMessageId: 'a',
        latencyMs: 5,
      },
    },
  ];

  it('round-trips through the SSE wire format', () => {
    const body = events.map(formatSseEvent).join('');
    expect(body.startsWith('event: turn_started\ndata: {')).toBe(true);
    expect(parseSseEvents(body)).toEqual(events);
  });

  it('rejects unknown event types and bad payloads', () => {
    expect(ChatEventSchema.safeParse({ type: 'progress', data: {} }).success).toBe(false);
    expect(ChatEventSchema.safeParse({ type: 'status', data: { stage: 'thinking' } }).success).toBe(
      false,
    );
  });
});

describe('PostMessageRequest', () => {
  it('accepts 1–2,000 characters after trimming', () => {
    expect(PostMessageRequestSchema.parse({ content: '  hi  ' })).toEqual({ content: 'hi' });
    expect(PostMessageRequestSchema.safeParse({ content: '   ' }).success).toBe(false);
    expect(PostMessageRequestSchema.safeParse({ content: 'x'.repeat(2001) }).success).toBe(false);
    expect(PostMessageRequestSchema.safeParse({ content: 'x', extra: 1 }).success).toBe(false);
  });
});
