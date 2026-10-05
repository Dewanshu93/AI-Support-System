// clarify (AI, P-4 ambiguity mode). Stub until W2-07.
import type { State, StateUpdate } from '../graph/state';
import { STUB_OUTPUT } from './stubs';

export function clarify(_state: State): StateUpdate {
  return { output: { ...STUB_OUTPUT, text: 'Stub clarifying question?' } };
}
