import { promises as fs } from "node:fs";
import * as path from "node:path";

/** Folder inside the Learner workspace that holds the progress file. */
export const PROGRESS_DIR = ".touching-grass";
/** The progress file inside PROGRESS_DIR. */
export const PROGRESS_FILE = "progress.json";
export const PROGRESS_VERSION = 2;

/** One Track's progress inside the progress file. */
export interface TrackProgress {
  /** Ids of the Steps whose Checks passed (or that were marked done), in Track order. */
  doneSteps: string[];
  /** The Step the Learner is on. Resume opens it. */
  currentStep?: string;
  /** Steps that counted as done because the Learner has no key for their Provider. */
  skippedSteps?: string[];
  /** The Provider chosen after the first Provider Lesson. */
  chosenProvider?: string;
  /** True once the Learner used "Start from its finished code" for the Track this one builds on. */
  usedStarter?: boolean;
}

/**
 * What is saved in the Learner workspace. Plain JSON: progress for each Track, keyed by Track title, so several
 * Tracks can share one workspace. To add a per-Track field, add it to `TrackProgress` and read it in `parseTrackProgress`.
 */
export interface ProgressFile {
  version: number;
  tracks: Record<string, TrackProgress>;
}

export type ParsedProgress = { ok: true; value: ProgressFile } | { ok: false; reason: string };

const isStringList = (v: unknown): v is string[] => Array.isArray(v) && v.every((s) => typeof s === "string");

/** Reads one Track's entry. The same shape in a version 1 file (where it sits at the top) and in version 2. */
function parseTrackProgress(
  r: Record<string, unknown>,
): { ok: true; value: TrackProgress } | { ok: false; reason: string } {
  if (!isStringList(r.doneSteps)) return { ok: false, reason: "doneSteps is not a list of Step ids" };
  if (r.currentStep !== undefined && typeof r.currentStep !== "string") {
    return { ok: false, reason: "currentStep is not a Step id" };
  }
  if (r.skippedSteps !== undefined && !isStringList(r.skippedSteps)) {
    return { ok: false, reason: "skippedSteps is not a list of Step ids" };
  }
  if (r.chosenProvider !== undefined && typeof r.chosenProvider !== "string") {
    return { ok: false, reason: "chosenProvider is not a Provider name" };
  }
  if (r.usedStarter !== undefined && typeof r.usedStarter !== "boolean") {
    return { ok: false, reason: "usedStarter is not true or false" };
  }
  return {
    ok: true,
    value: {
      doneSteps: r.doneSteps,
      ...(r.currentStep !== undefined ? { currentStep: r.currentStep as string } : {}),
      ...(r.skippedSteps !== undefined ? { skippedSteps: r.skippedSteps as string[] } : {}),
      ...(r.chosenProvider !== undefined ? { chosenProvider: r.chosenProvider as string } : {}),
      ...(r.usedStarter !== undefined ? { usedStarter: r.usedStarter as boolean } : {}),
    },
  };
}

/**
 * Reads progress text. Anything that is not a well-formed progress file is rejected with a reason.
 * A version 1 file (one Track at the top level) is migrated to a version 2 file holding that one Track.
 */
export function parseProgressFile(text: string): ParsedProgress {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, reason: "not valid JSON" };
  }
  if (!raw || typeof raw !== "object") return { ok: false, reason: "not an object" };
  const r = raw as Record<string, unknown>;
  if (r.version === 1) {
    if (typeof r.trackTitle !== "string") return { ok: false, reason: "trackTitle is missing" };
    const entry = parseTrackProgress(r);
    if (!entry.ok) return entry;
    return { ok: true, value: { version: PROGRESS_VERSION, tracks: { [r.trackTitle]: entry.value } } };
  }
  if (r.version !== PROGRESS_VERSION) return { ok: false, reason: `unsupported version ${String(r.version)}` };
  if (!r.tracks || typeof r.tracks !== "object" || Array.isArray(r.tracks)) {
    return { ok: false, reason: "tracks is not an object" };
  }
  const tracks: Record<string, TrackProgress> = {};
  for (const [title, value] of Object.entries(r.tracks)) {
    if (!value || typeof value !== "object") return { ok: false, reason: `the entry for "${title}" is not an object` };
    const entry = parseTrackProgress(value as Record<string, unknown>);
    if (!entry.ok) return { ok: false, reason: `${entry.reason} (in "${title}")` };
    tracks[title] = entry.value;
  }
  return { ok: true, value: { version: PROGRESS_VERSION, tracks } };
}

export function serializeProgressFile(progress: ProgressFile): string {
  return `${JSON.stringify(progress, null, 2)}\n`;
}

/** Where progress text lives. The seam that lets tests use something other than the real folder. */
export interface ProgressStore {
  /** The saved text, or undefined when there is no file yet. */
  read(): Promise<string | undefined>;
  write(text: string): Promise<void>;
  /** Keep a copy of the current file as `progress.json.bak`, so nothing is lost when it is replaced. */
  setAside(): Promise<void>;
}

/** A ProgressStore backed by `<workspace>/.touching-grass/progress.json`. */
export function createFileProgressStore(workspace: string): ProgressStore {
  const dir = path.join(workspace, PROGRESS_DIR);
  const file = path.join(dir, PROGRESS_FILE);
  return {
    async read() {
      try {
        return await fs.readFile(file, "utf8");
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === "ENOENT") return undefined;
        throw e;
      }
    },
    async write(text) {
      await fs.mkdir(dir, { recursive: true });
      const tmp = `${file}.tmp`;
      await fs.writeFile(tmp, text, "utf8");
      await fs.rename(tmp, file);
    },
    async setAside() {
      await fs.copyFile(file, `${file}.bak`);
    },
  };
}
