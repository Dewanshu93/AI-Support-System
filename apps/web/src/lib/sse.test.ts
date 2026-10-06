import { type ChatEvent, formatSseEvent } from '@sd/shared';
import { ApiError } from './api';
import { createSseParser, streamChat } from './sse';

const events: ChatEvent[] = [
  { type: 'turn_started', data: { userMessageId: 'u', assistantMessageId: 'a' } },
  { type: 'token', data: { text: 'Line one\nline two' } },
  {
    type: 'done',
    data: {
      decision: 'ANSWER',
      reasonCode: 'EVIDENCE_STRONG',
      assistantMessageId: 'a',
      latencyMs: 9,
    },
  },
];
const wire = events.map(formatSseEvent).join('');

afterEach(() => jest.restoreAllMocks());

describe('createSseParser', () => {
  it('parses events split at arbitrary chunk boundaries', () => {
    const seen: ChatEvent[] = [];
    const parser = createSseParser((e) => seen.push(e));
    for (let i = 0; i < wire.length; i += 7) parser.push(wire.slice(i, i + 7));
    expect(seen).toEqual(events);
  });

  it('accepts CRLF line endings', () => {
    const seen: ChatEvent[] = [];
    createSseParser((e) => seen.push(e)).push(wire.replace(/\n/g, '\r\n'));
    expect(seen).toEqual(events);
  });

  it('rejects an event that does not match the shared schema', () => {
    const parser = createSseParser(() => undefined);
    expect(() => parser.push('event: status\ndata: {"stage":"dreaming"}\n\n')).toThrow(ApiError);
  });
});

describe('streamChat', () => {
  it('POSTs JSON to the same-origin endpoint and dispatches the streamed events', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(
        new Response(wire, { status: 200, headers: { 'Content-Type': 'text/event-stream' } }),
      );
    const seen: ChatEvent[] = [];
    await streamChat('/conversations/x/messages', { content: 'hi' }, (e) => seen.push(e));
    expect(seen).toEqual(events);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/conversations/x/messages');
    expect(init).toMatchObject({
      method: 'POST',
      credentials: 'include',
      body: '{"content":"hi"}',
    });
  });

  it('turns an error envelope before the stream into an ApiError', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          error: { code: 'CONFLICT', message: 'A turn is already running', requestId: 'r1' },
        }),
        {
          status: 409,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    );
    await expect(streamChat('/x', {}, () => undefined)).rejects.toMatchObject({
      status: 409,
      code: 'CONFLICT',
      requestId: 'r1',
    });
  });
});
