'use client';

// Drives one chat turn: sends the message (or escalation), streams the SSE
// events into the turn state machine (lib/chatTurn.ts).
import { useCallback, useReducer, useRef } from 'react';
import { ApiError } from '@/lib/api';
import { IDLE, turnReducer } from '@/lib/chatTurn';
import { streamChat } from '@/lib/sse';

export function useChatTurn() {
  const [state, dispatch] = useReducer(turnReducer, IDLE);
  const busy = useRef(false);

  const send = useCallback(
    async (conversationId: string, text: string, options: { escalate?: boolean } = {}) => {
      if (busy.current) return;
      busy.current = true;
      dispatch({ type: 'send', text });
      let finished = false;
      let received = false;
      try {
        await streamChat(
          options.escalate
            ? `/conversations/${conversationId}/escalate`
            : `/conversations/${conversationId}/messages`,
          options.escalate ? {} : { content: text },
          (event) => {
            received = true;
            if (event.type === 'done' || event.type === 'error') finished = true;
            dispatch({ type: 'event', event });
          },
        );
        if (!finished) {
          dispatch({
            type: 'failed',
            code: 'INCOMPLETE',
            message: 'The reply was interrupted. Please try again.',
            retryable: true,
          });
        }
      } catch (err) {
        const e = err instanceof ApiError ? err : null;
        if (!e && received) {
          // The connection dropped mid-turn; the server still finishes and stores the reply.
          dispatch({
            type: 'failed',
            code: 'INCOMPLETE',
            message: 'The reply was interrupted. Reload the conversation or try again.',
            retryable: true,
          });
          return;
        }
        dispatch({
          type: 'failed',
          code: e?.code ?? 'NETWORK',
          message: e?.message ?? 'Cannot reach the service. Check your connection and retry.',
          retryable: e?.code !== 'CONFLICT',
        });
      } finally {
        busy.current = false;
      }
    },
    [],
  );

  const reset = useCallback(() => dispatch({ type: 'reset' }), []);
  return { state, send, reset };
}
