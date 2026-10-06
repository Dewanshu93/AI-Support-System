// Deterministic precheck (playbook section 5): sensitive topics from
// config/sensitive.yaml and safety rules from config/priority-rules.yaml.
// Pure and synchronous; a sensitive hit routes to the handoff before any LLM
// call. False positives are acceptable, false negatives are not.
import type { ConfigFiles } from '../../config/schemas';
import type { Precheck } from '../graph/state';

interface CompiledRule {
  id: string;
  patterns: RegExp[];
}

export interface PrecheckRules {
  run(text: string): Precheck;
}

const compile = (patterns: string[]) => patterns.map((p) => new RegExp(p, 'i'));

export function compilePrecheckRules(
  sensitive: ConfigFiles['sensitive'],
  priorityRules: ConfigFiles['priorityRules'],
): PrecheckRules {
  const sensitiveRules: CompiledRule[] = sensitive.rules.map((r) => ({
    id: r.id,
    patterns: compile(r.patterns),
  }));
  const safetyRules: CompiledRule[] = priorityRules.floors.flatMap((f) =>
    f.kind === 'safety' ? [{ id: f.id, patterns: compile(f.patterns) }] : [],
  );
  const matching = (rules: CompiledRule[], text: string) =>
    rules.filter((r) => r.patterns.some((p) => p.test(text))).map((r) => r.id);

  return {
    run(text) {
      // Collapse whitespace so a pattern is not dodged by line breaks or double spaces.
      const normalised = text.replace(/\s+/g, ' ');
      const sensitiveHits = matching(sensitiveRules, normalised);
      const safetyHits = matching(safetyRules, normalised);
      return {
        sensitiveHit: sensitiveHits.length > 0,
        safetyHit: safetyHits.length > 0,
        matchedRules: [...sensitiveHits, ...safetyHits],
      };
    },
  };
}
