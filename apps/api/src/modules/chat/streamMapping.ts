// Maps graph activity onto the SSE chat events (playbook section 4).
import type { ChatStage } from '@sd/shared';

/** Node starts that change the stage shown to the employee. */
export const STAGE_FOR_NODE: Record<string, ChatStage> = {
  loadContext: 'analyzing',
  retrieve: 'searching',
  answer: 'writing',
  clarify: 'writing',
  slotFill: 'preparing_ticket',
};

/**
 * Passes streamed answer text through, stopping at the fenced JSON trailer
 * (```json { "uncovered": … }) that P-3 appends after the prose. Trailing
 * backticks and whitespace are held back until it is clear no fence follows.
 */
export class ProseFilter {
  private buffer = '';
  private sent = 0;
  private stopped = false;

  push(piece: string): string {
    if (this.stopped) return '';
    this.buffer += piece;
    const fence = this.buffer.indexOf('```');
    let end: number;
    if (fence >= 0) {
      end = fence;
      this.stopped = true;
    } else {
      end = this.buffer.length;
      // Hold back trailing backticks and whitespace: they may lead into a fence.
      while (end > this.sent && /[\s`]/.test(this.buffer[end - 1]!)) end--;
    }
    const out = this.buffer.slice(this.sent, end);
    this.sent = end;
    return this.stopped ? out.trimEnd() : out;
  }
}

/** Text of a streamed chat-model chunk (string or content parts). */
export function chunkText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .map((part: unknown) =>
      typeof part === 'string'
        ? part
        : part && typeof part === 'object' && 'text' in part
          ? String((part as { text: unknown }).text)
          : '',
    )
    .join('');
}
