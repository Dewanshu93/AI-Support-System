// Heading-aware chunker (playbook section 7, steps 3–4). Pure: no I/O.
// LangChain JS has no Markdown header splitter, so H2/H3 splitting is done
// here; LangChain's recursive splitter handles over-long prose blocks.
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';

export const CHUNK_TOKENS = { target: 350, max: 500, overlap: 60 } as const;

const NL = String.fromCharCode(10);

/** Bump whenever chunking output changes, so the content hash forces re-ingestion. */
export const CHUNKER_VERSION = 1;

/**
 * Token estimate (≈ 4 characters per token for English text). Deterministic
 * and offline; only used to size chunks and report statistics.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export interface ChunkDraft {
  ordinal: number;
  /** Heading trail, e.g. ["Parental Leave", "Eligibility"]; empty for text before the first heading. */
  sectionPath: string[];
  text: string;
  tokenCount: number;
}

/** Step 3: normalise line endings and whitespace, keeping Markdown tables intact. */
export function normaliseMarkdown(body: string): string {
  return body
    .normalize('NFC')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

interface Section {
  path: string[];
  lines: string[];
}

function splitSections(body: string): Section[] {
  const sections: Section[] = [];
  let h2: string | undefined;
  let current: Section = { path: [], lines: [] };
  for (const line of body.split('\n')) {
    const heading = /^(#{2,3})\s+(.+?)\s*#*$/.exec(line);
    if (heading) {
      sections.push(current);
      const title = heading[2]!.trim();
      if (heading[1] === '##') h2 = title;
      current = { path: heading[1] === '##' || !h2 ? [title] : [h2, title], lines: [] };
    } else {
      current.lines.push(line);
    }
  }
  sections.push(current);
  return sections.filter((s) => s.lines.join('\n').trim().length > 0);
}

interface Block {
  text: string;
  table: boolean;
}

interface Piece extends Block {
  /** Produced by the recursive splitter, which already overlaps neighbouring pieces. */
  presplit: boolean;
}

/** Paragraphs, lists and tables; a table (consecutive `|` lines) is one block. */
function splitBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  let buffer: string[] = [];
  let inTable = false;
  const flush = () => {
    const joined = buffer.join('\n').trim();
    if (joined) blocks.push({ text: joined, table: inTable });
    buffer = [];
  };
  for (const line of text.split('\n')) {
    const isRow = line.trimStart().startsWith('|');
    if (isRow !== inTable || (!isRow && line.trim() === '')) {
      flush();
      inTable = isRow;
    }
    if (line.trim() !== '' || isRow) buffer.push(line);
  }
  flush();
  return blocks;
}

/** A table larger than max tokens is split between rows; each part repeats the header. */
function splitTable(table: string): string[] {
  const rows = table.split('\n');
  const header = rows.slice(0, 2);
  const parts: string[] = [];
  let current = [...header];
  for (const row of rows.slice(2)) {
    if (current.length > 2 && estimateTokens([...current, row].join('\n')) > CHUNK_TOKENS.max) {
      parts.push(current.join('\n'));
      current = [...header];
    }
    current.push(row);
  }
  parts.push(current.join('\n'));
  return parts;
}

const proseSplitter = new RecursiveCharacterTextSplitter({
  chunkSize: CHUNK_TOKENS.max,
  chunkOverlap: CHUNK_TOKENS.overlap,
  lengthFunction: estimateTokens,
});

/** Last ~60 tokens of a prose chunk, cut at a word boundary, to start the next chunk. */
function overlapTail(text: string): string {
  const chars = CHUNK_TOKENS.overlap * 4;
  if (text.length <= chars) return text;
  const tail = text.slice(-chars);
  return tail.slice(tail.indexOf(' ') + 1);
}

async function chunkSection(section: Section): Promise<string[]> {
  const text = section.lines.join(NL).trim();
  if (estimateTokens(text) <= CHUNK_TOKENS.max) return [text];

  // Long section: tables stay whole (or split between rows); over-long prose goes
  // through LangChain's recursive splitter, which already overlaps its pieces.
  const pieces: Piece[] = [];
  for (const block of splitBlocks(text)) {
    if (estimateTokens(block.text) <= CHUNK_TOKENS.max) pieces.push({ ...block, presplit: false });
    else if (block.table)
      pieces.push(
        ...splitTable(block.text).map((t) => ({ text: t, table: true, presplit: false })),
      );
    else
      pieces.push(
        ...(await proseSplitter.splitText(block.text)).map((t) => ({
          text: t,
          table: false,
          presplit: true,
        })),
      );
  }

  // Pack pieces up to the maximum; each new chunk starts with ~60 tokens of the
  // previous prose for context (never with part of a table).
  const join = (blocks: Piece[]) => blocks.map((b) => b.text).join(NL + NL);
  const chunks: string[] = [];
  let current: Piece[] = [];
  for (const piece of pieces) {
    if (current.length > 0 && estimateTokens(join([...current, piece])) > CHUNK_TOKENS.max) {
      chunks.push(join(current));
      const last = current[current.length - 1]!;
      const carry: Piece = { text: overlapTail(last.text), table: false, presplit: false };
      current =
        !last.table &&
        !piece.table &&
        !piece.presplit &&
        estimateTokens(join([carry, piece])) <= CHUNK_TOKENS.max
          ? [carry]
          : [];
    }
    current.push(piece);
  }
  if (current.length > 0) chunks.push(join(current));
  return chunks;
}

/** Step 4: split a normalised Markdown body into ordered chunk drafts. */
export async function chunkMarkdown(body: string): Promise<ChunkDraft[]> {
  const drafts: ChunkDraft[] = [];
  for (const section of splitSections(normaliseMarkdown(body))) {
    for (const text of await chunkSection(section)) {
      drafts.push({
        ordinal: drafts.length,
        sectionPath: section.path,
        text,
        tokenCount: estimateTokens(text),
      });
    }
  }
  return drafts;
}
