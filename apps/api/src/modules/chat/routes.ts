// Chat endpoints (playbook section 4): post a message or escalate; the reply is
// an SSE stream of ChatEvents. Errors before the stream starts (404, 409, 400)
// are normal JSON error envelopes; failures during the turn are error events.
import {
  API_BASE_PATH,
  type ChatEvent,
  ConversationParamsSchema,
  type EscalateRequest,
  EscalateRequestSchema,
  formatSseEvent,
  type PostMessageRequest,
  PostMessageRequestSchema,
} from '@sd/shared';
import type { RequestHandler, Response } from 'express';
import type { RouteDef } from '../../http/routes';
import { validate } from '../../http/validate';
import type { ConversationService } from '../conversations/service';
import type { TurnRunner } from './turnRunner';

/** Default user message for the "talk to a person" button. */
export const ESCALATE_DEFAULT_TEXT = 'Please connect me with a person.';

function openStream(res: Response) {
  res.status(200).set({
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();
  let open = true;
  res.on('close', () => {
    open = false;
  });
  return (event: ChatEvent) => {
    // After a disconnect the turn keeps running and persisting; we just stop writing.
    if (open && !res.writableEnded) res.write(formatSseEvent(event));
  };
}

export function chatRoutes(service: ConversationService, runner: TurnRunner): RouteDef[] {
  const base = `${API_BASE_PATH}/conversations/:id`;

  const turn =
    (
      content: (req: Parameters<RequestHandler>[0]) => string,
      forceEscalate: boolean,
    ): RequestHandler =>
    async (req, res) => {
      const { id } = req.validated.params as { id: string };
      const conversation = await service.getOwned(id, req.user!);
      const started = await runner.begin({
        conversation,
        user: req.user!,
        content: content(req),
        forceEscalate,
      });
      const emit = openStream(res);
      await started.run(emit);
      res.end();
    };

  return [
    {
      method: 'post',
      path: `${base}/messages`,
      access: ['employee'],
      rateLimit: 'chat',
      handlers: [
        validate({ params: ConversationParamsSchema, body: PostMessageRequestSchema }),
        turn((req) => (req.body as PostMessageRequest).content, false),
      ],
    },
    {
      method: 'post',
      path: `${base}/escalate`,
      access: ['employee'],
      rateLimit: 'chat',
      handlers: [
        validate({ params: ConversationParamsSchema, body: EscalateRequestSchema }),
        turn((req) => (req.body as EscalateRequest).reason || ESCALATE_DEFAULT_TEXT, true),
      ],
    },
  ];
}
