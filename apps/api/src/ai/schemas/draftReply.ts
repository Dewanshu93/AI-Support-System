// P-7 agent_draft_reply output (W3-06, playbook section 6). A first reply the
// agent edits before sending; code keeps only cited documents that were given.
import { z } from 'zod';
import { maxWords } from './common';

export const AgentDraftReplySchema = z.object({
  /** Placeholders such as [confirm date] where a fact is not in the ticket or the sources. */
  body: z.string().trim().min(1).refine(maxWords(150), 'must be at most 150 words'),
  /** IDs of the given documents the reply relies on. */
  citedDocumentIds: z.array(z.string().trim().min(1)).max(5),
});
export type AgentDraftReply = z.output<typeof AgentDraftReplySchema>;
