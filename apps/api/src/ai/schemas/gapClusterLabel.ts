// P-8 gap_cluster_label output (W4-02, playbook section 6): a name for a cluster
// of questions the knowledge base could not answer. The fallback label when the
// call fails is chosen in code ("Unlabelled cluster").
import { z } from 'zod';
import { maxWords } from './common';

export const GapClusterLabelSchema = z.object({
  /** The missing topic, not the users: at most 8 words. */
  label: z.string().trim().min(1).refine(maxWords(8), 'must be at most 8 words'),
  domain: z.enum(['IT', 'HR', 'unknown']),
});
export type GapClusterLabel = z.output<typeof GapClusterLabelSchema>;
