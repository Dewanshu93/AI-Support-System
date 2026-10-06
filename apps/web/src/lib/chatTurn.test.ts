import type { ChatEvent } from '@sd/shared';
import { IDLE, isBusy, splitMarkers, type TurnState, turnReducer } from './chatTurn';

const run = (
  events: ChatEvent[],
  from: TurnState = turnReducer(IDLE, { type: 'send', text: 'hi' }),
) => events.reduce((s, event) => turnReducer(s, { type: 'event', event }), from);

const citation = {
  marker: 'S1',
  chunkId: 'a'.repeat(24),
  documentId: 'b'.repeat(24),
  docTitle: 'Annual Leave (US)',
  sectionPath: ['Entitlement'],
  effectiveDate: '2026-01-01T00:00:00.000Z',
};
const started: ChatEvent = {
  type: 'turn_started',
  data: { userMessageId: 'u1', assistantMessageId: 'a1' },
};
const done = (
  decision: 'ANSWER' | 'ESCALATE' | 'CLARIFY' | 'SENSITIVE_HANDOFF' = 'ANSWER',
  reasonCode = 'EVIDENCE_STRONG',
): ChatEvent => ({
  type: 'done',
  data: { decision, reasonCode, assistantMessageId: 'a1', latencyMs: 1200 },
});

describe('turnReducer (SSE state machine)', () => {
  it('idle → streaming on send, with the user text shown at once', () => {
    const s = turnReducer(IDLE, { type: 'send', text: 'How much leave?' });
    expect(s).toMatchObject({ phase: 'streaming', userText: 'How much leave?', text: '' });
    expect(isBusy(s)).toBe(true);
  });

  it('answer: streaming → awaiting_citations → done', () => {
    const phases: string[] = [];
    let s = turnReducer(IDLE, { type: 'send', text: 'q' });
    for (const event of [
      started,
      { type: 'status', data: { stage: 'searching' } },
      { type: 'token', data: { text: 'You get 15 days ' } },
      { type: 'token', data: { text: '[S1].' } },
      { type: 'citations', data: { items: [citation] } },
      done(),
    ] as ChatEvent[]) {
      s = turnReducer(s, { type: 'event', event });
      phases.push(s.phase);
    }
    expect(phases).toEqual([
      'streaming',
      'streaming',
      'awaiting_citations',
      'awaiting_citations',
      'awaiting_citations',
      'done',
    ]);
    expect(s).toMatchObject({
      text: 'You get 15 days [S1].',
      stage: 'searching',
      citations: [citation],
      citationsResolved: true,
      decision: 'ANSWER',
      userMessageId: 'u1',
      assistantMessageId: 'a1',
    });
    expect(isBusy(s)).toBe(false);
  });

  it('citations are pending until the citations event arrives', () => {
    const s = run([started, { type: 'token', data: { text: 'A [S1].' } }]);
    expect(s.citationsResolved).toBe(false);
  });

  it('withdrawn: the streamed text is replaced in place and stays withdrawn after done', () => {
    const s = run([
      started,
      { type: 'token', data: { text: 'You get 28 days [S1].' } },
      {
        type: 'withdrawn',
        data: { reason: 'NUMERIC_MISMATCH', replacementText: 'I could not back that up.' },
      },
      done('ESCALATE', 'CITATION_INVALID'),
    ]);
    expect(s).toMatchObject({
      phase: 'withdrawn',
      text: 'I could not back that up.',
      citations: [],
      withdrawnReason: 'NUMERIC_MISMATCH',
      reasonCode: 'CITATION_INVALID',
    });
  });

  it('handoff: the handoff text becomes the reply', () => {
    const s = run([
      started,
      {
        type: 'handoff',
        data: {
          kind: 'sensitive',
          text: 'Please contact HR.',
          contact: 'HR line',
          offerPrivateContact: true,
        },
      },
      done('SENSITIVE_HANDOFF', 'SENSITIVE_TOPIC'),
    ]);
    expect(s).toMatchObject({
      phase: 'done',
      text: 'Please contact HR.',
      handoff: { kind: 'sensitive', offerPrivateContact: true },
    });
  });

  it('ticket draft is kept for the draft card', () => {
    const draft = {
      domain: 'IT' as const,
      category: 'network',
      subcategory: null,
      queue: { id: 'it_software', label: 'IT Software' },
      priority: 'medium' as const,
      aiUrgency: 'medium' as const,
      priorityFloorApplied: null,
      impactScope: 'me' as const,
      summary: 's',
      description: 'd',
      alreadyTried: [],
      errorMessages: [],
      fields: {},
      aiFilledFields: [],
      requiredMissing: [],
      articlesShown: [],
      restricted: false,
    };
    const s = run([
      started,
      { type: 'ticket_draft', data: { draft, missingFields: [] } },
      done('ESCALATE', 'USER_REQUESTED'),
    ]);
    expect(s.ticketDraft).toEqual({ draft, missingFields: [] });
  });

  it('error event or transport failure → error; later events are ignored', () => {
    const s = run([
      started,
      { type: 'token', data: { text: 'partial' } },
      { type: 'error', data: { code: 'LLM_UNAVAILABLE', message: 'Try again', retryable: true } },
    ]);
    expect(s).toMatchObject({
      phase: 'error',
      error: { code: 'LLM_UNAVAILABLE', retryable: true },
    });
    expect(turnReducer(s, { type: 'event', event: done() })).toBe(s);
    const failed = turnReducer(turnReducer(IDLE, { type: 'send', text: 'q' }), {
      type: 'failed',
      code: 'CONFLICT',
      message: 'A turn is already running',
      retryable: false,
    });
    expect(failed).toMatchObject({ phase: 'error', error: { code: 'CONFLICT' } });
  });

  it('reset returns to idle', () => {
    expect(turnReducer(run([started, done()]), { type: 'reset' })).toBe(IDLE);
  });
});

describe('splitMarkers', () => {
  it('splits text and citation markers', () => {
    expect(splitMarkers('You get 15 days [S1][S2]. Carry over [s3, S4].')).toEqual([
      { kind: 'text', text: 'You get 15 days ' },
      { kind: 'marker', marker: 'S1' },
      { kind: 'marker', marker: 'S2' },
      { kind: 'text', text: '. Carry over ' },
      { kind: 'marker', marker: 'S3' },
      { kind: 'marker', marker: 'S4' },
      { kind: 'text', text: '.' },
    ]);
    expect(splitMarkers('No markers')).toEqual([{ kind: 'text', text: 'No markers' }]);
  });
});
