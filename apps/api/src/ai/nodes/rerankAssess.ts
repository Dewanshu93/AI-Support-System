// rerankAssess (AI, P-2). Stub until W2-04: keeps the retrieval as given.
import type { State, StateUpdate } from '../graph/state';

export function rerankAssess(state: State): StateUpdate {
  return { retrieval: state.retrieval };
}
