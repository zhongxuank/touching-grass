/** A Code Chunk: real code the Learner types by hand into `targetFile` of their agent project. */
export interface CodeChunk {
  language: string;
  /** Path of the file, relative to the Learner's agent project, the chunk belongs in. */
  targetFile: string;
  code: string;
  /** True when no earlier Step in the Track writes to `targetFile`, so the Learner creates the file. */
  newFile: boolean;
  /** Set when no earlier Step writes into this folder (relative path, `/` separators): the Learner creates it too. */
  newFolder?: string;
  /** Where the code goes in an existing file, from the Step's `place:` line. Required when `newFile` is false. */
  place?: string;
}

/** Files a Step puts in the Learner's workspace for them, from its `copy:` line. */
export interface StepCopy {
  /** Folder in the Track folder, relative to it, `/` separators. Always exists when the Track loads. */
  from: string;
  /** Folder in the Learner's agent workspace, relative to it, `/` separators. Never leaves the workspace. */
  to: string;
}

export interface Step {
  /** `<lesson id>/<1-based position>`, stable while Steps keep their order. */
  id: string;
  title: string;
  /** Markdown. Shown to the Learner before the Code Chunk. */
  explanation: string;
  codeChunk: CodeChunk;
  /** The Provider this Step is specific to. Without a key for it the Step is read-only; see the Track format. */
  provider?: string;
  /** Check files this Step needs, named relative to the Track's `checks/` folder. */
  checks: string[];
  /** A Habit of the Track this Step's Code Chunk models. Shown as a callout. */
  habit?: string;
  /** A shell command the Learner runs in the agent workspace to see their code work, from the `run:` line. */
  run?: string;
  /** A folder of the Track copied into the Learner's workspace by a button, from the `copy:` line. */
  copy?: StepCopy;
}

export interface Lesson {
  /** The Lesson file name without its extension. */
  id: string;
  title: string;
  /** Markdown before the first Step. */
  intro: string;
  steps: Step[];
  /** Reflection questions at the end of the Lesson. */
  reflection: string[];
}

export interface Track {
  title: string;
  habits: string[];
  /** Title of the earlier Track this one continues (`builds_on:` in track.md), if any. */
  buildsOn?: string;
  /** Lessons in the order the Track file lists them. */
  lessons: Lesson[];
}

/** A page of the Track's sequence the Learner moves through: a Step, or a Lesson's Reflection after its last Step. */
export type Page = { kind: "step"; step: Step } | { kind: "reflection"; lesson: Lesson };

/** One problem in a Track folder, named by file (relative to the Track folder) and, when known, line. */
export interface ValidationError {
  file: string;
  line?: number;
  message: string;
}

/** What the Check runner reports for one Check (one Check file). */
export interface CheckResult {
  /** The Check file name as written in the Step's `checks:` line. */
  check: string;
  passed: boolean;
  /** pytest's output for this Check, shown to the Learner when it fails. */
  output: string;
}

export interface CheckRunRequest {
  /** The Learner's agent workspace: pytest runs here and imports the Learner's code from here. */
  workspace: string;
  /** Check files to run: their names and absolute paths inside the Track folder. */
  checks: { name: string; file: string }[];
  /** Extra environment for the Checks: the Learner's `.env` values, so Checks can call a real LLM. */
  env?: Record<string, string>;
}

export type CheckRunOutcome =
  | { ok: true; results: CheckResult[] }
  /** uv or Python could not be run, so no Check ran. */
  | { ok: false; reason: "tooling-missing"; message: string };

/** Runs Checks. Injected into the engine so tests can use a fake. */
export interface CheckRunner {
  run(request: CheckRunRequest): Promise<CheckRunOutcome>;
}

export type RunChecksOutcome =
  | { status: "no-workspace" }
  | { status: "tooling-missing"; message: string }
  /** The Step is for a Provider with no key: Checks were skipped and the Step counts as done. */
  | { status: "skipped"; provider: string }
  | { status: "ran"; results: CheckResult[]; done: boolean };

/** Learner progress. Plain JSON-safe data so a later ticket can save and restore it. */
export interface Progress {
  /** Ids of the Steps whose Checks have passed (or that were marked done). */
  doneSteps: string[];
  /** The Step the Learner is on. */
  currentStep?: string;
  /** The Provider the Learner chose after the first Provider Lesson, if they have. */
  chosenProvider?: string;
  /** Ids of Steps counted as done because their Provider has no key. A subset of `doneSteps`. */
  skippedSteps?: string[];
}
