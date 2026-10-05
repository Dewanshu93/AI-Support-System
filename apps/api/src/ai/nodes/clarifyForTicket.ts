// clarifyForTicket (AI, P-4 ticket mode). Stub until W3.
import type { State, StateUpdate } from '../graph/state';
import { STUB_OUTPUT } from './stubs';

export function clarifyForTicket(state: State): StateUpdate {
  const asked = state.ticketFlow.requiredMissing.slice(0, 2).join(', ');
  return {
    ticketFlow: { ...state.ticketFlow, clarifyRounds: state.ticketFlow.clarifyRounds + 1 },
    output: { ...STUB_OUTPUT, ...state.output, text: `Stub question for ${asked}?` },
  };
}
