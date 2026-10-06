// sensitiveHandoff (code, template; playbook section 5). No AI advice, no
// field extraction and never any retrieved policy text: the reply is built from
// templates only, shows a human contact and ends with "Would you like HR to
// contact you privately?". The restricted ticket on "Yes" is W3-03.
import { fillTemplate } from '../../domain/templates';
import type { State, StateUpdate } from '../graph/state';
import type { TemplateDeps } from './outOfScope';

export function createSensitiveHandoff({ templates }: TemplateDeps) {
  return function sensitiveHandoff(state: State): StateUpdate {
    const contact = fillTemplate(templates.sensitive_contact);
    return {
      output: {
        text: fillTemplate(templates.sensitive_handoff, { contact }),
        citations: [],
        uncovered: [],
        withdrawn: false,
        handoff: { kind: 'sensitive', contact, offerPrivateContact: true },
      },
      trace: {
        outputs: {
          handoff: {
            kind: 'sensitive',
            matchedRules: state.precheckResult?.matchedRules ?? [],
            byAnalysis: state.analysis?.sensitivity === 'sensitive',
          },
        },
      },
    };
  };
}
