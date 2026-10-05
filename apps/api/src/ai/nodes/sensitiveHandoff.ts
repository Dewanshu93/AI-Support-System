// sensitiveHandoff (code, template): no AI advice, no field extraction. Stub until W2-07.
import type { State, StateUpdate } from '../graph/state';
import { STUB_OUTPUT } from './stubs';

export function sensitiveHandoff(_state: State): StateUpdate {
  return {
    output: {
      ...STUB_OUTPUT,
      text: 'Stub sensitive handoff.',
      handoff: { kind: 'sensitive', contact: 'stub' },
    },
  };
}
