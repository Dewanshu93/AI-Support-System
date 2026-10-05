// slotFill (AI, P-5). Stub until W3: opens the ticket flow and keeps the
// missing-field list as given.
import type { State, StateUpdate } from '../graph/state';

export function slotFill(state: State): StateUpdate {
  return {
    ticketFlow: {
      ...state.ticketFlow,
      active: true,
      category: state.ticketFlow.category ?? state.analysis?.category,
    },
  };
}
