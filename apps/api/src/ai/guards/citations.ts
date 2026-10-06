// Citation validator (playbook section 5, validateCitations). The model only
// writes [Sx] markers; code maps them to chunks through the final context, so
// an answer can never cite a chunk that was not retrieved for this employee.
// Markers outside the context are rejected and removed from the text.
import type { Citation, ContextSource } from '../graph/state';

export interface CitationCheck {
  /** Distinct markers in the answer, in order of first appearance. */
  proposed: string[];
  valid: Citation[];
  /** Proposed markers with no source in the context. */
  rejected: string[];
  /** The answer with rejected markers removed. */
  text: string;
}

/** `[S1]`, `[S1][S2]` and `[S1, S2]` (case-insensitive). */
const MARKER_GROUP = /\[\s*(s\d+(?:\s*,\s*s\d+)*)\s*\]/gi;

export function checkCitations(text: string, context: ContextSource[]): CitationCheck {
  const sources = new Map(context.map((s) => [s.marker.toUpperCase(), s]));
  const proposed: string[] = [];
  const cleaned = text.replace(MARKER_GROUP, (_group, list: string) => {
    const markers = list.split(',').map((m) => m.trim().toUpperCase());
    for (const m of markers) if (!proposed.includes(m)) proposed.push(m);
    return markers
      .filter((m) => sources.has(m))
      .map((m) => `[${m}]`)
      .join('');
  });
  const valid = proposed.flatMap((m) => {
    const s = sources.get(m);
    return s
      ? [
          {
            marker: m,
            chunkId: s.chunkId,
            documentId: s.documentId,
            docTitle: s.docTitle,
            sectionPath: s.sectionPath,
            effectiveDate: s.effectiveDate,
          },
        ]
      : [];
  });
  return {
    proposed,
    valid,
    rejected: proposed.filter((m) => !sources.has(m)),
    // Tidy the gaps left by removed markers.
    text: cleaned.replace(/[ \t]+([.,;:!?])/g, '$1').replace(/[ \t]{2,}/g, ' '),
  };
}
