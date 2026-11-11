import { promises as fs } from "node:fs";
import * as path from "node:path";
import { checkLessonFileList, parseLessonFile, parseTrackFile } from "./parse";
import { createCheckRunner } from "./checkRunner";
import type { CheckRunner, Lesson, Progress, RunChecksOutcome, Step, Track, ValidationError } from "./types";

export type {
  CheckResult,
  CheckRunOutcome,
  CheckRunRequest,
  CheckRunner,
  CodeChunk,
  Lesson,
  Progress,
  RunChecksOutcome,
  Step,
  Track,
  ValidationError,
} from "./types";
export { createCheckRunner } from "./checkRunner";
export { looksLikePastedChunk, PASTE_MATCH_RATIO, PASTE_MIN_LINES } from "./paste";
export {
  createFileProgressStore,
  parseProgressFile,
  PROGRESS_DIR,
  PROGRESS_FILE,
  serializeProgressFile,
  type ProgressFile,
  type ProgressStore,
} from "./progress";
import { createFileProgressStore, parseProgressFile, PROGRESS_FILE, serializeProgressFile, type ProgressStore } from "./progress";

/** What opening a workspace found in its progress file. */
export interface WorkspaceOpenResult {
  /** Set when the existing file was ignored or set aside, so the Learner can be told why. */
  notice?: string;
}

/** A loaded Track. Later tickets hang progress, Provider choice and Check results here. */
export interface TrackSession {
  /** The Track > Lesson > Step structure. */
  readonly track: Track;
  getStep(stepId: string): Step | undefined;
  /** Choose the Learner's agent workspace, where Checks run. Separate from the Track folder. Does not read progress. */
  setWorkspace(folder: string): void;
  getWorkspace(): string | undefined;
  /**
   * Choose the agent workspace and load its progress file (`.touching-grass/progress.json`), merging it with
   * progress made so far. Saves the merged progress. A file for another Track, or a corrupt one, is set aside as `.bak`.
   */
  openWorkspace(folder: string, store?: ProgressStore): Promise<WorkspaceOpenResult>;
  /** Run the Step's Checks. The Step becomes done when every Check passes. */
  runChecks(stepId: string): Promise<RunChecksOutcome>;
  /** Mark a Step with no Checks done. Returns false for a Step that has Checks or does not exist. */
  markDone(stepId: string): boolean;
  isDone(stepId: string): boolean;
  /** The Step after this one, crossing into the next Lesson, only once this one is done. */
  advance(stepId: string): Step | undefined;
  /** Absolute path of a Check file in the Track folder. */
  checkFilePath(name: string): string;
  /** Progress as plain data, ready to be saved. */
  getProgress(): Progress;
  /** The Step the Learner is on, or the first Step if none has been opened yet. */
  getCurrentStep(): string | undefined;
  /**
   * Open a Step in the panel. An unfinished Step becomes the current Step and is saved.
   * A done Step is opened read-only and leaves the current Step where it is.
   */
  openStep(stepId: string): Step | undefined;
  /** Wait for pending saves. Resolves with a message if a save failed, otherwise undefined. */
  flush(): Promise<string | undefined>;
}

export interface LoadTrackOptions {
  /** Defaults to the uv + pytest runner. Tests inject a fake. */
  checkRunner?: CheckRunner;
}

export type LoadTrackResult =
  | { ok: true; session: TrackSession }
  | { ok: false; errors: ValidationError[] };

/** Name of the Track-level file inside a Track folder. */
export const TRACK_FILE = "track.md";
/** Folder inside a Track folder that holds the Check files named by `checks:` lines. */
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
export async function loadTrack(folder: string, options: LoadTrackOptions = {}): Promise<LoadTrackResult> {
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
  const order = lessons.flatMap((l) => l.steps);
  const runner = options.checkRunner ?? createCheckRunner();
  const done = new Set<string>();
  let current: string | undefined = order[0]?.id;
  let workspace: string | undefined;
  let store: ProgressStore | undefined;
  let saving: Promise<void> = Promise.resolve();
  let saveError: string | undefined;
  const checkFilePath = (name: string) => path.join(folder, CHECKS_DIR, name);

  const snapshot = (): string =>
    serializeProgressFile({
      version: 1,
      trackTitle: track.title,
      doneSteps: order.filter((s) => done.has(s.id)).map((s) => s.id),
      currentStep: current,
    });
  /** Queue a save of the current progress. Saves run one after another; a failed save is reported by flush(). */
  const persist = () => {
    if (!store) return;
    const text = snapshot();
    const target = store;
    saving = saving
      .then(() => target.write(text))
      .catch((e: unknown) => {
        saveError = `${(e as Error).message}`;
      });
  };

  const session: TrackSession = {
    track,
    getStep: (id) => steps.get(id),
    setWorkspace: (f) => {
      workspace = f;
    },
    async openWorkspace(folder, target = createFileProgressStore(folder)) {
      workspace = folder;
      store = target;
      let notice: string | undefined;
      let text: string | undefined;
      try {
        text = await target.read();
      } catch (e) {
        notice = `Cannot read the progress file, so starting fresh: ${(e as Error).message}`;
      }
      let saved: { trackTitle: string; doneSteps: string[]; currentStep?: string } | undefined;
      if (text !== undefined) {
        const parsed = parseProgressFile(text);
        const reason = !parsed.ok
          ? `The progress file is unreadable (${parsed.reason}), so starting fresh.`
          : parsed.value.trackTitle !== track.title
            ? `The progress file is for another Track ("${parsed.value.trackTitle}"), so starting fresh.`
            : undefined;
        if (parsed.ok && !reason) saved = parsed.value;
        else {
          notice = reason;
          try {
            await target.setAside();
            notice += ` The old file is saved as ${PROGRESS_FILE}.bak.`;
          } catch {
            notice += " The old file could not be copied to a .bak file.";
          }
        }
      }
      const ids = new Set(order.map((s) => s.id));
      for (const id of saved?.doneSteps ?? []) if (ids.has(id)) done.add(id);
      if (saved?.currentStep && ids.has(saved.currentStep)) current = saved.currentStep;
      persist();
      return notice ? { notice } : {};
    },
    getWorkspace: () => workspace,
    async runChecks(stepId) {
      const step = steps.get(stepId);
      if (!step) throw new Error(`Unknown Step: ${stepId}`);
      if (!workspace) return { status: "no-workspace" };
      const outcome = await runner.run({
        workspace,
        checks: step.checks.map((name) => ({ name, file: checkFilePath(name) })),
      });
      if (!outcome.ok) return { status: "tooling-missing", message: outcome.message };
      const passed = outcome.results.length > 0 && outcome.results.every((r) => r.passed);
      if (passed) {
        done.add(stepId);
        persist();
      }
      return { status: "ran", results: outcome.results, done: done.has(stepId) };
    },
    markDone(stepId) {
      const step = steps.get(stepId);
      if (!step || step.checks.length > 0) return false;
      done.add(stepId);
      persist();
      return true;
    },
    isDone: (id) => done.has(id),
    advance(stepId) {
      if (!done.has(stepId)) return undefined;
      return order[order.findIndex((s) => s.id === stepId) + 1];
    },
    checkFilePath,
    getProgress: () => ({ doneSteps: order.filter((s) => done.has(s.id)).map((s) => s.id), currentStep: current }),
    getCurrentStep: () => current,
    openStep(stepId) {
      const step = steps.get(stepId);
      if (!step) return undefined;
      if (!done.has(stepId) && current !== stepId) {
        current = stepId;
        persist();
      }
      return step;
    },
    async flush() {
      await saving;
      const error = saveError;
      saveError = undefined;
      return error ? `Could not save progress: ${error}` : undefined;
    },
  };
  return { ok: true, session };
}

export function formatValidationError(e: ValidationError): string {
  return `${e.file}${e.line ? `:${e.line}` : ""}: ${e.message}`;
}
