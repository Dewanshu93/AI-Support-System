// answer (AI, P-3, streamed). Stub until W2-06. The mode is chosen by code.
import type { State, StateUpdate } from '../graph/state';
import type { AnswerMode } from '../schemas';
import { STUB_OUTPUT } from './stubs';

export function answerMode(state: State): AnswerMode {
  const decision = state.decision;
  if (decision?.value === 'ESCALATE' && decision.reasonCode === 'SAFETY') return 'safety_steps';
  return decision?.value === 'PARTIAL' ? 'partial' : 'answer';
}

export function answer(state: State): StateUpdate {
  return {
    output: {
      ...STUB_OUTPUT,
      text: 'Stub answer [S1].',
      citations: [{ marker: 'S1', chunkId: 'stub-chunk' }],
      ...state.output,
      mode: answerMode(state),
    },
  };
}
