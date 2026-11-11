import type { CodeChunk } from "./types";

/** A paste must bring at least this many non-blank lines of the Code Chunk (fewer for a shorter chunk). */
export const PASTE_MIN_LINES = 3;

/** Share of the Code Chunk's lines an insert must contain to look like a paste of it. */
export const PASTE_MATCH_RATIO = 0.8;

/** Non-blank lines with whitespace collapsed and trimmed at both ends. */
function normalisedLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line.length > 0);
}

/**
 * True when `inserted` looks like the Learner pasted most of `chunk`. Whitespace is ignored
 * (indentation, runs of spaces, trailing spaces, blank lines), so a typed edit or the indent
 * VSCode adds after Enter never matches.
 */
export function looksLikePastedChunk(inserted: string, chunk: CodeChunk): boolean {
  const chunkLines = normalisedLines(chunk.code);
  const needed = Math.max(2, Math.min(PASTE_MIN_LINES, chunkLines.length));
  if (chunkLines.length < needed) return false;

  const remaining = new Map<string, number>();
  for (const line of normalisedLines(inserted)) remaining.set(line, (remaining.get(line) ?? 0) + 1);

  let matched = 0;
  for (const line of chunkLines) {
    const count = remaining.get(line) ?? 0;
    if (count > 0) {
      matched++;
      remaining.set(line, count - 1);
    }
  }
  return matched >= needed && matched / chunkLines.length >= PASTE_MATCH_RATIO;
}
