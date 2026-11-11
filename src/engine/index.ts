import { promises as fs } from "node:fs";
import * as path from "node:path";
import { checkLessonFileList, parseLessonFile, parseTrackFile } from "./parse";
import type { Lesson, Step, Track, ValidationError } from "./types";

export type { CodeChunk, Lesson, Step, Track, ValidationError } from "./types";

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

/** Folder inside a Track folder that holds the Check files named by a Step's `checks:`. */
export const CHECKS_DIR = "checks";

async function readText(folder: string, rel: string, missingMessage: string): Promise<string | ValidationError> {
  try {
    return await fs.readFile(path.join(folder, rel), "utf8");
  } catch (e) {
    const missing = (e as NodeJS.ErrnoException).code === "ENOENT";
    return { file: rel, message: missing ? missingMessage : `Cannot read file: ${(e as Error).message}` };
  }
}

/** Names of the files under `checks/`, relative to it, with `/` separators. Empty if there is no such folder. */
async function listCheckFiles(folder: string): Promise<Set<string>> {
  try {
    const names = await fs.readdir(path.join(folder, CHECKS_DIR), { recursive: true });
    return new Set(names.map((n) => n.split(path.sep).join("/")));
  } catch {
    return new Set();
  }
}

/** Load a Track folder, returning a session or every validation error found. Pure Node: no vscode import. */
export async function loadTrack(folder: string): Promise<LoadTrackResult> {
  const trackText = await readText(
    folder,
    TRACK_FILE,
    "Track file not found. A Track folder must contain a track.md file.",
  );
  if (typeof trackText !== "string") return { ok: false, errors: [trackText] };
  const trackFile = parseTrackFile(TRACK_FILE, trackText);
  if (!trackFile.value) return { ok: false, errors: trackFile.errors };

  const errors: ValidationError[] = checkLessonFileList(TRACK_FILE, trackText, trackFile.value.lessonFiles);
  const checkFiles = await listCheckFiles(folder);
  const lessons: Lesson[] = [];
  const seen = new Set<string>();
  for (const rel of trackFile.value.lessonFiles) {
    const key = path.posix.normalize(rel);
    if (seen.has(key)) continue; // already reported by checkLessonFileList
    seen.add(key);
    const text = await readText(
      folder,
      rel,
      "Lesson file not found. Create it, or remove it from `lessons` in track.md.",
    );
    if (typeof text !== "string") {
      errors.push(text);
      continue;
    }
    const id = path.basename(rel, path.extname(rel));
    const lesson = parseLessonFile(rel, id, text, { checkFiles });
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
