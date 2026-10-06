// outOfScope (code, template; playbook section 5). A fixed reply that says
// what the assistant can help with. No LLM call, no retrieved text.
import type { ConfigFiles } from '../../config/schemas';
import { fillTemplate } from '../../domain/templates';
import type { State, StateUpdate } from '../graph/state';

export interface TemplateDeps {
  templates: ConfigFiles['templates']['templates'];
}

export function createOutOfScope({ templates }: TemplateDeps) {
  return function outOfScope(_state: State): StateUpdate {
    return {
      output: {
        text: fillTemplate(templates.out_of_scope),
        citations: [],
        uncovered: [],
        withdrawn: false,
        handoff: { kind: 'out_of_scope' },
      },
    };
  };
}
