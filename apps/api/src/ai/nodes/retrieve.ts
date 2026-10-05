// retrieve (code + embeddings). Stub until W2-04.
import type { State, StateUpdate } from '../graph/state';
import { stubRetrieval } from './stubs';

export function retrieve(state: State): StateUpdate {
  return {
    retrieval: state.retrieval ?? stubRetrieval(state.analysis?.searchQuery ?? state.input.text),
  };
}
