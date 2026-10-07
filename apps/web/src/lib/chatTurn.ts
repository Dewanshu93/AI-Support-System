// State machine for one chat turn (playbook section 10):
//   idle → streaming → awaiting_citations → done | withdrawn | error
// streaming: request sent, stage updates arriving, no text yet.
// awaiting_citations: answer text is arriving; [Sx] markers show as pending
//   chips until the citations event resolves them.
// done / withdrawn / error are final. Pure, so it is unit-tested directly.
import type { ChatEvent, ChatStage, CitationDto, Decision } from '@sd/shared';

export type TurnPhase =
  'idle' | 'streaming' | 'awaiting_citations' | 'done' | 'withdrawn' | 'error';

export interface TurnState {
  phase: TurnPhase;
  /** What the employee sent (shown immediately). */
  userText: string;
  stage: ChatStage | null;
  text: string;
  citations: CitationDto[];
  /** Citations arrived (or the turn finished without any). */
  citationsResolved: boolean;
  withdrawnReason: string | null;
  handoff: Extract<ChatEvent, { type: 'handoff' }>['data'] | null;
  ticketDraft: Extract<ChatEvent, { type: 'ticket_draft' }>['data'] | null;
  /** A copilot action awaiting confirmation (UC-05). */
  actionDraft: Extract<ChatEvent, { type: 'action_draft' }>['data'] | null;
  decision: Decision | null;
  reasonCode: string | null;
  userMessageId: string | null;
  assistantMessageId: string | null;
  latencyMs: number | null;
  error: { code: string; message: string; retryable: boolean } | null;
}

export const IDLE: TurnState = {
  phase: 'idle',
  userText: '',
  stage: null,
  text: '',
  citations: [],
  citationsResolved: false,
  withdrawnReason: null,
  handoff: null,
  ticketDraft: null,
  actionDraft: null,
  decision: null,
  reasonCode: null,
  userMessageId: null,
  assistantMessageId: null,
  latencyMs: null,
  error: null,
};

export type TurnAction =
  | { type: 'send'; text: string }
  | { type: 'event'; event: ChatEvent }
  | { type: 'failed'; code: string; message: string; retryable: boolean }
  | { type: 'reset' };

// Events after done or error are ignored; a withdrawn turn still receives its done event.
const FINAL: TurnPhase[] = ['done', 'error'];

export function turnReducer(state: TurnState, action: TurnAction): TurnState {
  switch (action.type) {
    case 'send':
      return { ...IDLE, phase: 'streaming', userText: action.text };
    case 'reset':
      return IDLE;
    case 'failed':
      return {
        ...state,
        phase: 'error',
        error: { code: action.code, message: action.message, retryable: action.retryable },
      };
    case 'event':
      if (FINAL.includes(state.phase)) return state;
      return applyEvent(state, action.event);
  }
}

function applyEvent(state: TurnState, event: ChatEvent): TurnState {
  switch (event.type) {
    case 'turn_started':
      return { ...state, ...event.data, phase: 'streaming' };
    case 'status':
      return { ...state, stage: event.data.stage };
    case 'token':
      return { ...state, phase: 'awaiting_citations', text: state.text + event.data.text };
    case 'citations':
      return { ...state, citations: event.data.items, citationsResolved: true };
    case 'withdrawn':
      // The streamed text is replaced in place by the explanation.
      return {
        ...state,
        phase: 'withdrawn',
        text: event.data.replacementText,
        citations: [],
        citationsResolved: true,
        withdrawnReason: event.data.reason,
      };
    case 'ticket_draft':
      return { ...state, ticketDraft: event.data };
    case 'action_draft':
      return { ...state, actionDraft: event.data };
    case 'handoff':
      return { ...state, handoff: event.data, text: event.data.text };
    case 'done':
      return {
        ...state,
        phase: state.phase === 'withdrawn' ? 'withdrawn' : 'done',
        citationsResolved: true,
        decision: event.data.decision,
        reasonCode: event.data.reasonCode,
        assistantMessageId: event.data.assistantMessageId,
        latencyMs: event.data.latencyMs,
      };
    case 'error':
      return { ...state, phase: 'error', error: event.data };
  }
}

export const isBusy = (state: TurnState) =>
  state.phase === 'streaming' || state.phase === 'awaiting_citations';

/** A piece of answer text: plain text or a citation marker. */
export type TextPart = { kind: 'text'; text: string } | { kind: 'marker'; marker: string };

/** Splits answer text into text and [Sx] markers ([S1][S2] and [S1, S2] both work). */
export function splitMarkers(text: string): TextPart[] {
  const parts: TextPart[] = [];
  const re = /\[\s*(S\d+(?:\s*,\s*S\d+)*)\s*\]/gi;
  let last = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) parts.push({ kind: 'text', text: text.slice(last, m.index) });
    for (const marker of m[1]!.split(','))
      parts.push({ kind: 'marker', marker: marker.trim().toUpperCase() });
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push({ kind: 'text', text: text.slice(last) });
  return parts;
}
