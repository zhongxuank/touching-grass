import { promises as fs } from "node:fs";
import * as path from "node:path";
import { checkLessonFileList, parseLessonFile, parseTrackFile } from "./parse";
import { createCheckRunner } from "./checkRunner";
import { findSiblingTrack, REFERENCE_DIR } from "./buildsOn";
import { copyReferenceFolder } from "./starter";
import { isProvider, providersWithKeys, readEnvFile, type EnvReader, type Provider } from "./providers";
import type { CheckRunner, Lesson, Page, Progress, RunChecksOutcome, Step, Track, ValidationError } from "./types";

export type {
  CheckResult,
  CheckRunOutcome,
  CheckRunRequest,
  CheckRunner,
  CodeChunk,
  Lesson,
  Page,
  Progress,
  RunChecksOutcome,
  Step,
  Track,
  ValidationError,
} from "./types";
export { createCheckRunner } from "./checkRunner";
export { copyReferenceFolder, type CopyReferenceResult } from "./starter";
export { findSiblingTrack, REFERENCE_DIR } from "./buildsOn";
export {
  ENV_FILE,
  isProvider,
  parseEnv,
  PROVIDER_KEY_VARS,
  PROVIDERS,
  providersWithKeys,
  readEnvFile,
  type EnvReader,
  type Provider,
} from "./providers";
export { looksLikePastedChunk, PASTE_MATCH_RATIO, PASTE_MIN_LINES } from "./paste";
export {
  createFileProgressStore,
  parseProgressFile,
  PROGRESS_DIR,
  PROGRESS_FILE,
  serializeProgressFile,
  type ProgressFile,
  type ProgressStore,
  type TrackProgress,
} from "./progress";
export {
  CLAUDE_MD,
  CURRENT_STEP_FILE,
  renderCurrentStep,
  renderTutorGuide,
  TUTOR_GUIDE_FILE,
  TUTOR_IMPORT_LINE,
  TUTOR_PROMPT,
  withTutorImport,
  writeCurrentStep,
  writeTutorGuide,
  type TutorTrackInfo,
} from "./tutor";
import {
  createFileProgressStore,
  parseProgressFile,
  PROGRESS_FILE,
  PROGRESS_VERSION,
  serializeProgressFile,
  type ProgressStore,
  type TrackProgress,
} from "./progress";
import type { CopyReferenceResult } from "./starter";

/**
 * What to tell the Learner about the earlier Track a Track builds on. Absent when the Track builds on nothing,
 * the earlier Track is finished in this workspace, or the Learner already started from its finished code.
 */
export type BuildsOnNotice =
  /** The earlier Track is not finished: offer "Start from its finished code". */
  | { state: "unfinished"; title: string }
  /** No built-in Track has that title: say so, offer no button. */
  | { state: "missing"; title: string };

/** What `startFromEarlierCode` did. */
export type StarterOutcome =
  | { status: "no-workspace" }
  /** The Track builds on nothing, or the earlier Track cannot be found. */
  | { status: "missing" }
  /** The earlier Track has no `reference/` folder to copy. */
  | { status: "no-reference" }
  | ({ status: "copied" } & CopyReferenceResult);

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
   * Choose the agent workspace and load its progress file (`.touching-grass/progress.json`), merging this Track's
   * entry with progress made so far. Saves the merged progress, leaving other Tracks' entries as they are. A
   * corrupt file is set aside as `.bak`. A Track that builds on another takes over its chosen Provider.
   */
  openWorkspace(folder: string, store?: ProgressStore): Promise<WorkspaceOpenResult>;
  /**
   * For a Track with `builds_on`: whether to warn that the earlier Track is not finished (or not found). Reads
   * the workspace's progress for the earlier Track, so call `openWorkspace` first.
   */
  getBuildsOn(): Promise<BuildsOnNotice | undefined>;
  /**
   * Copy the earlier Track's `reference/` folder into the workspace, never overwriting a file, and record in
   * progress that the starter was used. Lists the copied and the skipped files.
   */
  startFromEarlierCode(): Promise<StarterOutcome>;
  /**
   * Look for Provider keys again (the workspace `.env`, then the process environment) and return the Providers
   * that have one. Presence only: no key value is ever returned. Run Checks and openWorkspace call this too.
   */
  detectProviders(): Promise<Provider[]>;
  /** Providers with a key as of the last detection. */
  getAvailableProviders(): Provider[];
  /** The Provider the Step needs a key for but has none of: the Step is read-only. Undefined otherwise. */
  missingProvider(stepId: string): string | undefined;
  /** True when the Step counted as done because its Provider has no key. */
  isSkipped(stepId: string): boolean;
  /**
   * True when `advance` held back the next Step because the Learner must first choose a Provider: they are
   * leaving the first Lesson with Provider Steps and have not chosen. Pick from `getAvailableProviders()`.
   */
  providerChoiceNeeded(): boolean;
  /** Save the Learner's Provider. Returns the Step `advance` held back. Unknown or keyless Providers are refused. */
  chooseProvider(provider: string): Step | undefined;
  getChosenProvider(): string | undefined;
  /** The Steps the Learner sees, in order: after a choice, Provider Steps for other Providers in later Lessons are hidden. */
  getVisibleSteps(): Step[];
  isVisible(stepId: string): boolean;
  /** Run the Step's Checks. The Step becomes done when every Check passes. A Step with no key for its Provider is skipped. */
  runChecks(stepId: string): Promise<RunChecksOutcome>;
  /** Mark a Step with no Checks done. Returns false for a Step that has Checks or does not exist. */
  markDone(stepId: string): boolean;
  isDone(stepId: string): boolean;
  /** The Step after this one, crossing into the next Lesson, only once this one is done. */
  advance(stepId: string): Step | undefined;
  /**
   * The pages the Learner moves through, in order: each Lesson's visible Steps, then its Reflection if it has
   * questions. Hidden Provider Steps are not pages.
   */
  getPages(): Page[];
  /** Stable id of a page: the Step id, or `<lesson id>/reflection`. */
  pageId(page: Page): string;
  /** `<lesson number>.<step number>` among the Lesson's visible Steps (e.g. "1.3"), or "Reflection". Undefined for a hidden or unknown page. */
  pageNumber(pageId: string): string | undefined;
  /** The page before this one. Always allowed. */
  previousPage(pageId: string): Page | undefined;
  /**
   * The page after this one. From a Step it needs the Step done, as `advance` does, and a Provider Step with no
   * key counts as passed by skip. Leaving the first Provider Lesson without a chosen Provider holds the move:
   * see `providerChoiceNeeded`. A Reflection needs nothing done.
   */
  nextPage(pageId: string): Page | undefined;
  /** Whether `nextPage` is open to the Learner now: the Step is done or skippable, or it is a Reflection. */
  canGoNext(pageId: string): boolean;
  /** Whether any page follows this one, whether or not the Learner may go there yet. */
  hasNextPage(pageId: string): boolean;
  /** Done and total visible Steps, for the whole Track or one Lesson. */
  progressCount(lessonId?: string): { done: number; total: number };
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
  /**
   * Start this Track again: no Step done or skipped, no Provider chosen, back at the first Step. Saves it.
   * Other Tracks' progress and the Learner's files stay as they are.
   */
  resetProgress(): void;
  /** Wait for pending saves. Resolves with a message if a save failed, otherwise undefined. */
  flush(): Promise<string | undefined>;
}

export interface LoadTrackOptions {
  /** Defaults to the uv + pytest runner. Tests inject a fake. */
  checkRunner?: CheckRunner;
  /** Reads the workspace `.env`. Defaults to the real file; tests inject a fake. */
  readEnv?: EnvReader;
  /** The fallback environment for Provider keys. Defaults to `process.env`. */
  processEnv?: NodeJS.ProcessEnv;
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

/** Whether a Step shows for the Learner: after a Provider is chosen, Provider Steps for others in later Lessons are hidden. */
function isStepVisible(track: Track, step: Step, chosen: string | undefined): boolean {
  if (!chosen || !step.provider || step.provider === chosen) return true;
  const first = track.lessons.findIndex((l) => l.steps.some((s) => s.provider));
  return track.lessons.findIndex((l) => l.steps.includes(step)) <= first;
}

/** Load a Track folder, returning a session or every validation error found. Pure Node: no vscode import. */
export async function loadTrack(trackFolder: string, options: LoadTrackOptions = {}): Promise<LoadTrackResult> {
  const folder = trackFolder;
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
  const seenFiles = new Set<string>();
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
    const lesson = parseLessonFile(rel, id, text, { checkFiles, habits: trackFile.value.habits, seenFiles });
    if (lesson.value) lessons.push(lesson.value);
    else errors.push(...lesson.errors);
  }
  if (errors.length) return { ok: false, errors };

  const track: Track = {
    title: trackFile.value.title,
    habits: trackFile.value.habits,
    ...(trackFile.value.buildsOn ? { buildsOn: trackFile.value.buildsOn } : {}),
    lessons,
  };
  const steps = new Map(lessons.flatMap((l) => l.steps).map((s) => [s.id, s]));
  const order = lessons.flatMap((l) => l.steps);
  const runner = options.checkRunner ?? createCheckRunner();
  const done = new Set<string>();
  const skipped = new Set<string>();
  const readEnv = options.readEnv ?? readEnvFile;
  const processEnv = options.processEnv ?? process.env;
  let available: Provider[] = providersWithKeys({}, processEnv);
  let dotEnv: Record<string, string> = {};
  let chosen: Provider | undefined;
  let held: Step | undefined;
  let usedStarter = false;
  const lessonOf = new Map(lessons.flatMap((l, i) => l.steps.map((s): [string, number] => [s.id, i])));
  const firstProviderLesson = lessons.findIndex((l) => l.steps.some((s) => s.provider));
  const visible = (s: Step) => isStepVisible(track, s, chosen);
  const pageIdOf = (p: Page) => (p.kind === "step" ? p.step.id : `${p.lesson.id}/reflection`);
  const pageLesson = (p: Page) => (p.kind === "step" ? lessonOf.get(p.step.id)! : lessons.indexOf(p.lesson));
  const pages = (): Page[] =>
    lessons.flatMap((lesson): Page[] => [
      ...lesson.steps.filter(visible).map((step): Page => ({ kind: "step", step })),
      ...(lesson.reflection.length ? [{ kind: "reflection", lesson } as Page] : []),
    ]);
  const detect = async (): Promise<Provider[]> => {
    dotEnv = workspace ? await readEnv(workspace) : {};
    available = providersWithKeys(dotEnv, processEnv);
    return [...available];
  };
  const missing = (step: Step): string | undefined =>
    step.provider && !available.includes(step.provider as Provider) ? step.provider : undefined;
  let current: string | undefined = order[0]?.id;
  let workspace: string | undefined;
  let store: ProgressStore | undefined;
  let saving: Promise<void> = Promise.resolve();
  let saveError: string | undefined;
  const checkFilePath = (name: string) => path.join(folder, CHECKS_DIR, name);

  /** This Track's entry in the progress file. */
  const snapshot = (): TrackProgress => ({
    doneSteps: order.filter((s) => done.has(s.id)).map((s) => s.id),
    ...(current !== undefined ? { currentStep: current } : {}),
    ...(skipped.size ? { skippedSteps: order.filter((s) => skipped.has(s.id)).map((s) => s.id) } : {}),
    ...(chosen ? { chosenProvider: chosen } : {}),
    ...(usedStarter ? { usedStarter } : {}),
  });
  /** Every Track's saved entry in the workspace progress file. Empty when there is no readable file. */
  const readTracks = async (target: ProgressStore): Promise<Record<string, TrackProgress>> => {
    const text = await target.read().catch(() => undefined);
    const parsed = text === undefined ? undefined : parseProgressFile(text);
    return parsed?.ok ? parsed.value.tracks : {};
  };
  /**
   * Queue a save of the current progress. Saves run one after another; a failed save is reported by flush().
   * The file is read again each time, so entries of other Tracks in the same workspace are kept.
   */
  const persist = () => {
    if (!store) return;
    const entry = snapshot();
    const target = store;
    saving = saving
      .then(async () => {
        const tracks = await readTracks(target);
        const file = { version: PROGRESS_VERSION, tracks: { ...tracks, [track.title]: entry } };
        await target.write(serializeProgressFile(file));
      })
      .catch((e: unknown) => {
        saveError = `${(e as Error).message}`;
      });
  };
  /** The folder of the earlier Track this one builds on, found next to this Track's folder. */
  const findEarlier = async (): Promise<string | undefined> =>
    track.buildsOn ? findSiblingTrack(trackFolder, track.buildsOn) : undefined;

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
      let saved: TrackProgress | undefined;
      let earlier: TrackProgress | undefined;
      if (text !== undefined) {
        const parsed = parseProgressFile(text);
        if (parsed.ok) {
          saved = parsed.value.tracks[track.title];
          earlier = track.buildsOn ? parsed.value.tracks[track.buildsOn] : undefined;
        } else {
          notice = `The progress file is unreadable (${parsed.reason}), so starting fresh.`;
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
      for (const id of saved?.skippedSteps ?? []) if (done.has(id)) skipped.add(id);
      if (saved?.currentStep && ids.has(saved.currentStep)) current = saved.currentStep;
      if (saved?.chosenProvider && isProvider(saved.chosenProvider)) chosen = saved.chosenProvider;
      // The Provider carries over from the earlier Track, unless the Learner already chose in this one.
      else if (!chosen && earlier?.chosenProvider && isProvider(earlier.chosenProvider)) chosen = earlier.chosenProvider;
      if (saved?.usedStarter) usedStarter = true;
      await detect();
      persist();
      await saving;
      return notice ? { notice } : {};
    },
    getWorkspace: () => workspace,
    async getBuildsOn() {
      if (!track.buildsOn || usedStarter) return undefined;
      const earlierFolder = await findEarlier();
      if (!earlierFolder) return { state: "missing", title: track.buildsOn };
      const entry = store ? (await readTracks(store))[track.buildsOn] : undefined;
      const earlier = await loadTrack(earlierFolder);
      if (entry && earlier.ok) {
        const finished = new Set(entry.doneSteps);
        const shown = earlier.session.track.lessons
          .flatMap((l) => l.steps)
          .filter((s) => isStepVisible(earlier.session.track, s, entry.chosenProvider));
        if (shown.every((s) => finished.has(s.id))) return undefined;
      }
      return { state: "unfinished", title: track.buildsOn };
    },
    async startFromEarlierCode() {
      if (!workspace) return { status: "no-workspace" };
      const earlierFolder = await findEarlier();
      if (!earlierFolder) return { status: "missing" };
      const reference = path.join(earlierFolder, REFERENCE_DIR);
      const isFolder = await fs.stat(reference).then((s) => s.isDirectory(), () => false);
      if (!isFolder) return { status: "no-reference" };
      const result = await copyReferenceFolder(reference, workspace);
      usedStarter = true;
      persist();
      return { status: "copied", ...result };
    },
    detectProviders: detect,
    getAvailableProviders: () => [...available],
    missingProvider: (id) => {
      const step = steps.get(id);
      return step ? missing(step) : undefined;
    },
    isSkipped: (id) => skipped.has(id),
    providerChoiceNeeded: () => held !== undefined,
    chooseProvider(provider) {
      if (!isProvider(provider) || !available.includes(provider)) return undefined;
      chosen = provider;
      const next = held ? order.slice(order.indexOf(held)).find(visible) : undefined;
      held = undefined;
      persist();
      return next;
    },
    getChosenProvider: () => chosen,
    getVisibleSteps: () => order.filter(visible),
    isVisible: (id) => {
      const step = steps.get(id);
      return !!step && visible(step);
    },
    async runChecks(stepId) {
      const step = steps.get(stepId);
      if (!step) throw new Error(`Unknown Step: ${stepId}`);
      if (!workspace) return { status: "no-workspace" };
      await detect();
      const absent = missing(step);
      if (absent) {
        done.add(stepId);
        skipped.add(stepId);
        persist();
        return { status: "skipped", provider: absent };
      }
      const outcome = await runner.run({
        workspace,
        checks: step.checks.map((name) => ({ name, file: checkFilePath(name) })),
        env: dotEnv,
      });
      if (!outcome.ok) return { status: "tooling-missing", message: outcome.message };
      const passed = outcome.results.length > 0 && outcome.results.every((r) => r.passed);
      if (passed) {
        done.add(stepId);
        skipped.delete(stepId);
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
    resetProgress() {
      done.clear();
      skipped.clear();
      chosen = undefined;
      held = undefined;
      current = order[0]?.id;
      persist();
    },
    advance(stepId) {
      const step = steps.get(stepId);
      if (!step) return undefined;
      if (!done.has(stepId)) {
        // A Provider Step with no key is read-only: moving on counts it as done by skip.
        if (!missing(step)) return undefined;
        done.add(stepId);
        skipped.add(stepId);
        persist();
      }
      const at = order.indexOf(step);
      const next = order.slice(at + 1).find(visible);
      held = undefined;
      if (!next) return undefined;
      const leavingFirstProviderLesson =
        lessonOf.get(stepId) === firstProviderLesson && lessonOf.get(next.id)! > firstProviderLesson;
      if (!chosen && available.length > 0 && leavingFirstProviderLesson) {
        held = next;
        return undefined;
      }
      return next;
    },
    getPages: pages,
    pageId: pageIdOf,
    pageNumber(id) {
      const page = pages().find((p) => pageIdOf(p) === id);
      if (!page) return undefined;
      if (page.kind === "reflection") return "Reflection";
      const lesson = lessonOf.get(page.step.id)!;
      return `${lesson + 1}.${lessons[lesson]!.steps.filter(visible).indexOf(page.step) + 1}`;
    },
    previousPage(id) {
      const list = pages();
      return list[list.findIndex((p) => pageIdOf(p) === id) - 1];
    },
    nextPage(id) {
      const list = pages();
      const at = list.findIndex((p) => pageIdOf(p) === id);
      const page = list[at];
      if (!page) return undefined;
      if (page.kind === "step" && !done.has(id)) {
        // A Provider Step with no key is read-only: moving on counts it as done by skip.
        if (!missing(page.step)) return undefined;
        done.add(id);
        skipped.add(id);
        persist();
      }
      held = undefined;
      const next = list[at + 1];
      if (!next) return undefined;
      const from = pageLesson(page);
      const to = pageLesson(next);
      if (!chosen && available.length > 0 && from === firstProviderLesson && to > firstProviderLesson) {
        held = lessons[to]!.steps.find(visible);
        if (held) return undefined;
      }
      return next;
    },
    canGoNext: (id) => {
      const page = pages().find((p) => pageIdOf(p) === id);
      if (!page) return false;
      return page.kind === "reflection" || done.has(id) || !!missing(page.step);
    },
    hasNextPage(id) {
      const list = pages();
      const at = list.findIndex((p) => pageIdOf(p) === id);
      return at >= 0 && at + 1 < list.length;
    },
    progressCount(lessonId) {
      const shown = (lessonId ? lessons.filter((l) => l.id === lessonId) : lessons).flatMap((l) => l.steps).filter(visible);
      return { done: shown.filter((s) => done.has(s.id)).length, total: shown.length };
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
