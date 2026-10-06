// Streaming client for the chat endpoints (playbook section 10): POSTs, then
// reads the response body stream and parses SSE events with the shared Zod
// schema. Errors before the stream starts come back as the JSON error envelope.
import { type ChatEvent, ChatEventSchema, ErrorEnvelopeSchema } from '@sd/shared';
import { ApiError } from './api';

/**
 * Incremental SSE parser: feed text chunks as they arrive; complete events
 * (blank-line terminated) are validated and passed to `onEvent`.
 */
export function createSseParser(onEvent: (event: ChatEvent) => void) {
  let buffer = '';
  return {
    push(chunk: string) {
      buffer += chunk.replace(/\r\n/g, '\n');
      let end: number;
      while ((end = buffer.indexOf('\n\n')) >= 0) {
        const block = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        let type: string | undefined;
        const data: string[] = [];
        for (const line of block.split('\n')) {
          if (line.startsWith('event:')) type = line.slice(6).trim();
          else if (line.startsWith('data:')) data.push(line.slice(5).trimStart());
        }
        if (!type) continue;
        const parsed = ChatEventSchema.safeParse({
          type,
          data: data.length ? JSON.parse(data.join('\n')) : {},
        });
        if (!parsed.success)
          throw new ApiError(200, 'INVALID_RESPONSE', `Unexpected ${type} event`);
        onEvent(parsed.data);
      }
    },
  };
}

/** POSTs to a chat endpoint and dispatches its events until the stream ends. */
export async function streamChat(
  path: string,
  body: unknown,
  onEvent: (event: ChatEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        Accept: 'text/event-stream',
        'Content-Type': 'application/json',
        'X-Requested-With': 'sd-web',
      },
      body: JSON.stringify(body),
      signal,
    });
  } catch {
    throw new ApiError(0, 'NETWORK', 'Cannot reach the service. Check your connection and retry.');
  }
  if (!res.ok || !res.body) {
    const envelope = ErrorEnvelopeSchema.safeParse(await res.json().catch(() => null));
    if (envelope.success) {
      const { code, message, requestId } = envelope.data.error;
      throw new ApiError(res.status, code, message, requestId);
    }
    throw new ApiError(res.status, 'INTERNAL', `Request failed (${res.status})`);
  }
  const parser = createSseParser(onEvent);
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    parser.push(value);
  }
}
