import { promises as fs } from "node:fs";
import * as path from "node:path";

/** Folder inside the Learner workspace that holds the progress file. */
export const PROGRESS_DIR = ".touching-grass";
/** The progress file inside PROGRESS_DIR. */
export const PROGRESS_FILE = "progress.json";
export const PROGRESS_VERSION = 1;

/**
 * What is saved in the Learner workspace. Plain JSON. To add a field (for example `chosenProvider`),
 * add it here, write it in `serializeProgressFile` and read it in `parseProgressFile`.
 */
export interface ProgressFile {
  version: number;
  /** Title of the Track the progress belongs to. */
  trackTitle: string;
  /** Ids of the Steps whose Checks passed (or that were marked done), in Track order. */
  doneSteps: string[];
  /** The Step the Learner is on. Resume opens it. */
  currentStep?: string;
  /** Steps that counted as done because the Learner has no key for their Provider. Absent in older files. */
  skippedSteps?: string[];
  /** The Provider chosen after the first Provider Lesson. Absent in older files. */
  chosenProvider?: string;
}

export type ParsedProgress = { ok: true; value: ProgressFile } | { ok: false; reason: string };

/** Reads progress text. Anything that is not a well-formed progress file is rejected with a reason. */
export function parseProgressFile(text: string): ParsedProgress {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, reason: "not valid JSON" };
  }
  if (!raw || typeof raw !== "object") return { ok: false, reason: "not an object" };
  const r = raw as Record<string, unknown>;
  if (r.version !== PROGRESS_VERSION) return { ok: false, reason: `unsupported version ${String(r.version)}` };
  if (typeof r.trackTitle !== "string") return { ok: false, reason: "trackTitle is missing" };
  if (!Array.isArray(r.doneSteps) || !r.doneSteps.every((s) => typeof s === "string")) {
    return { ok: false, reason: "doneSteps is not a list of Step ids" };
  }
  if (r.currentStep !== undefined && typeof r.currentStep !== "string") {
    return { ok: false, reason: "currentStep is not a Step id" };
  }
  if (r.skippedSteps !== undefined && (!Array.isArray(r.skippedSteps) || !r.skippedSteps.every((s) => typeof s === "string"))) {
    return { ok: false, reason: "skippedSteps is not a list of Step ids" };
  }
  if (r.chosenProvider !== undefined && typeof r.chosenProvider !== "string") {
    return { ok: false, reason: "chosenProvider is not a Provider name" };
  }
  return {
    ok: true,
    value: {
      version: PROGRESS_VERSION,
      trackTitle: r.trackTitle,
      doneSteps: r.doneSteps as string[],
      ...(r.currentStep !== undefined ? { currentStep: r.currentStep as string } : {}),
      ...(r.skippedSteps !== undefined ? { skippedSteps: r.skippedSteps as string[] } : {}),
      ...(r.chosenProvider !== undefined ? { chosenProvider: r.chosenProvider as string } : {}),
    },
  };
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
