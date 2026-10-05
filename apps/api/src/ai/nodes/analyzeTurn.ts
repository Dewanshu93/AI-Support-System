// analyzeTurn (AI, P-1). Stub until W2-03.
import type { State, StateUpdate } from '../graph/state';
import { stubAnalysis } from './stubs';

export function analyzeTurn(state: State): StateUpdate {
  return { analysis: state.analysis ?? stubAnalysis(state.input.text) };
}
