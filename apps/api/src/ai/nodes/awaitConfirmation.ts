// awaitConfirmation (LangGraph interrupt). Pauses with the draft; the
// confirm/cancel request resumes it with a Confirmation value. LangGraph
// re-runs this node from the top on resume, so it has no side effects.
import { interrupt } from '@langchain/langgraph';
import {
  ConfirmationSchema,
  EMPTY_TICKET_FLOW,
  type State,
  type StateUpdate,
} from '../graph/state';

export function awaitConfirmation(state: State): StateUpdate {
  const confirmation = ConfirmationSchema.parse(interrupt({ draft: state.output?.draft }));
  return {
    confirmation,
    ticketFlow: confirmation.action === 'cancel' ? EMPTY_TICKET_FLOW : state.ticketFlow,
  };
}
