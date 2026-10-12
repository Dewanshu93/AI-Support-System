// P-6 agent_ticket_summary output (W3-06, playbook section 6). An agent-facing
// view of a new ticket; the ticket's summary stays the one the employee confirmed.
import { z } from 'zod';
import { maxWords } from './common';

export const AgentSummaryResultSchema = z.object({
  /** One line for the agent's queue. */
  summary: z.string().trim().min(1).refine(maxWords(15), 'must be at most 15 words'),
  /** What happened, what the employee needs, what is already known or tried. */
  agentBrief: z.string().trim().min(1).refine(maxWords(100), 'must be at most 100 words'),
  /** First things the agent could check; empty when nothing useful applies. */
  suggestedFirstChecks: z
    .array(z.string().trim().min(1).refine(maxWords(25), 'must be at most 25 words'))
    .max(3),
});
export type AgentSummaryResult = z.output<typeof AgentSummaryResultSchema>;
