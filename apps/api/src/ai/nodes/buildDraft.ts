// buildDraft (code). Stub until W3. Keeps any answer text (safety mode).
import type { State, StateUpdate } from '../graph/state';
import { STUB_OUTPUT } from './stubs';

export function buildDraft(state: State): StateUpdate {
  return {
    ticketFlow: { ...state.ticketFlow, requiredMissing: [] },
    output: {
      ...STUB_OUTPUT,
      text: 'Stub draft ready for review.',
      ...state.output,
      draft: {
        domain: state.analysis?.domain ?? 'unknown',
        category: state.ticketFlow.category ?? 'none',
        summary: 'Stub summary',
        fields: state.ticketFlow.fields,
      },
    },
  };
}
