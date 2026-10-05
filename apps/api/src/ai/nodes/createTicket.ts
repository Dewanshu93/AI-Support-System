// createTicket (code, graph-owned tool node). Stub until W3.
import { EMPTY_TICKET_FLOW, type State, type StateUpdate } from '../graph/state';
import { STUB_OUTPUT } from './stubs';

export function createTicket(state: State): StateUpdate {
  return {
    ticketFlow: EMPTY_TICKET_FLOW,
    output: { ...STUB_OUTPUT, ...state.output, ticketId: 'stub-ticket' },
  };
}
