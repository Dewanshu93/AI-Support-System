// Trace accumulator (playbook section 5): every node is wrapped so its latency
// is appended to state.trace. llmCalls and errors are appended by the nodes
// themselves through the same append reducer.
import type { State, StateUpdate } from '../graph/state';

export type NodeFn = (state: State) => Promise<StateUpdate> | StateUpdate;

/** Wraps a node so each run appends `{ node, latencyMs }` to the turn trace. */
export function traced(node: string, fn: NodeFn, now: () => number = () => performance.now()) {
  return async (state: State): Promise<StateUpdate> => {
    const started = now();
    const update = await fn(state);
    const latencyMs = Math.round(now() - started);
    // Keep whatever the node itself traced (llmCalls, outputs, flags).
    const own = update.trace && !('reset' in update.trace) ? update.trace : {};
    return {
      ...update,
      trace: { ...own, steps: [{ node, latencyMs }], stepLatencyMs: { [node]: latencyMs } },
    };
  };
}
