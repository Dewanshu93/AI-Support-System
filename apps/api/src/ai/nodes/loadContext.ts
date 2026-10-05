// loadContext (code): profile and the last 8 messages. Stub until W2-03.
import type { State, StateUpdate } from '../graph/state';
import { STUB_PROFILE } from './stubs';

export function loadContext(state: State): StateUpdate {
  return { profile: state.profile ?? STUB_PROFILE, history: state.history };
}
