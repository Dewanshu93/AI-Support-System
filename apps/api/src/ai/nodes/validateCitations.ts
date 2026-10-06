// validateCitations (code; playbook section 5). Maps [Sx] markers to the final
// context, removes markers with no source, and checks numbers against the cited
// chunks. Zero valid citations, or a number with no source, withdraws the answer:
// the text is replaced by the withdrawn-answer template (offering a ticket) and,
// outside safety mode, the decision is re-recorded as ESCALATE / CITATION_INVALID.
import type { ConfigFiles } from '../../config/schemas';
import { fillTemplate } from '../../domain/templates';
import type { Output, State, StateUpdate } from '../graph/state';
import { checkCitations } from '../guards/citations';
import { numericViolations } from '../guards/numericCheck';

export const ANSWER_WITHDRAWN = 'ANSWER_WITHDRAWN';

export interface ValidateCitationsDeps {
  templates: ConfigFiles['templates']['templates'];
}

export function createValidateCitations({ templates }: ValidateCitationsDeps) {
  return function validateCitations(state: State): StateUpdate {
    const output = state.output;
    if (!output) throw new Error('validateCitations: answer did not run');
    const context = state.retrieval?.context ?? [];

    const check = checkCitations(output.text, context);
    const citedIds = new Set(check.valid.map((c) => c.chunkId));
    const citedTexts = context.filter((s) => citedIds.has(s.chunkId)).map((s) => s.text);
    const numeric = check.valid.length > 0 ? numericViolations(check.text, citedTexts) : [];
    const withdrawnReason: Output['withdrawnReason'] =
      check.valid.length === 0
        ? 'NO_VALID_CITATIONS'
        : numeric.length > 0
          ? 'NUMERIC_MISMATCH'
          : undefined;

    const logged = {
      citationsProposed: check.proposed,
      citationsValid: check.valid.map((c) => ({ marker: c.marker, chunkId: c.chunkId })),
      citationsRejected: check.rejected,
      numericViolations: numeric,
      withdrawn: withdrawnReason !== undefined,
      ...(withdrawnReason && { withdrawnReason }),
    };

    if (!withdrawnReason) {
      return {
        output: { ...output, text: check.text, citations: check.valid },
        trace: { outputs: { citations: logged } },
      };
    }

    const domain = state.analysis?.domain;
    const text = fillTemplate(templates.withdrawn_answer, {
      domain: domain === 'IT' || domain === 'HR' ? domain : 'IT or HR',
    });
    // Safety mode keeps ESCALATE / SAFETY: the ticket draft follows either way.
    const keepDecision = output.mode === 'safety_steps';
    return {
      output: { ...output, text, citations: [], withdrawn: true, withdrawnReason },
      ...(!keepDecision && {
        decision: {
          value: 'ESCALATE' as const,
          reasonCode: 'CITATION_INVALID',
          rulesFired: [...(state.decision?.rulesFired ?? []), 'citations'],
        },
      }),
      trace: { outputs: { citations: logged }, flags: [ANSWER_WITHDRAWN] },
    };
  };
}
