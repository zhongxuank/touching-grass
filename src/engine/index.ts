import { promises as fs } from "node:fs";
import * as path from "node:path";
import { parseLessonFile, parseTrackFile } from "./parse";
import type { Lesson, Step, Track, ValidationError } from "./types";

export type { CodeChunk, Lesson, Step, Track, ValidationError } from "./types";
export { looksLikePastedChunk, PASTE_MATCH_RATIO, PASTE_MIN_LINES } from "./paste";

/** A loaded Track. Later tickets hang progress, Provider choice and Check results here. */
export interface TrackSession {
  /** The Track > Lesson > Step structure. */
  readonly track: Track;
  getStep(stepId: string): Step | undefined;
}

export type LoadTrackResult =
  | { ok: true; session: TrackSession }
  | { ok: false; errors: ValidationError[] };

/** Name of the Track-level file inside a Track folder. */
export const TRACK_FILE = "track.md";

async function readText(folder: string, rel: string): Promise<string | ValidationError> {
  try {
    return await fs.readFile(path.join(folder, rel), "utf8");
  } catch (e) {
    const missing = (e as NodeJS.ErrnoException).code === "ENOENT";
    return { file: rel, message: missing ? "File not found." : `Cannot read file: ${(e as Error).message}` };
  }
}

/** Load a Track folder, returning a session or every validation error found. Pure Node: no vscode import. */
export async function loadTrack(folder: string): Promise<LoadTrackResult> {
  const trackText = await readText(folder, TRACK_FILE);
  if (typeof trackText !== "string") return { ok: false, errors: [trackText] };
  const trackFile = parseTrackFile(TRACK_FILE, trackText);
  if (!trackFile.value) return { ok: false, errors: trackFile.errors };

  const errors: ValidationError[] = [];
  const lessons: Lesson[] = [];
  for (const rel of trackFile.value.lessonFiles) {
    const text = await readText(folder, rel);
    if (typeof text !== "string") {
      errors.push(text);
      continue;
    }
    const id = path.basename(rel, path.extname(rel));
    const lesson = parseLessonFile(rel, id, text, trackFile.value.habits);
    if (lesson.value) lessons.push(lesson.value);
    else errors.push(...lesson.errors);
  }
  if (errors.length) return { ok: false, errors };

  const track: Track = { title: trackFile.value.title, habits: trackFile.value.habits, lessons };
  const steps = new Map(lessons.flatMap((l) => l.steps).map((s) => [s.id, s]));
  return { ok: true, session: { track, getStep: (id) => steps.get(id) } };
}

export function formatValidationError(e: ValidationError): string {
  return `${e.file}${e.line ? `:${e.line}` : ""}: ${e.message}`;
}
