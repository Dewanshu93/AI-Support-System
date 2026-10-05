// outOfScope (code, template). Stub until W2-07.
import type { State, StateUpdate } from '../graph/state';
import { STUB_OUTPUT } from './stubs';

export function outOfScope(_state: State): StateUpdate {
  return {
    output: {
      ...STUB_OUTPUT,
      text: 'Stub out-of-scope reply.',
      handoff: { kind: 'out_of_scope', contact: 'stub' },
    },
  };
}
