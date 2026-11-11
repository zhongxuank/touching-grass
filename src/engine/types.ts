/** A Code Chunk: real code the Learner types by hand into `targetFile` of their agent project. */
export interface CodeChunk {
  language: string;
  /** Path of the file, relative to the Learner's agent project, the chunk belongs in. */
  targetFile: string;
  code: string;
}

export interface Step {
  /** `<lesson id>/<1-based position>`, stable while Steps keep their order. */
  id: string;
  title: string;
  /** Markdown. Shown to the Learner before the Code Chunk. */
  explanation: string;
  codeChunk: CodeChunk;
  /** Reserved: Provider this Step is specific to. Parsed, not acted on yet. */
  provider?: string;
  /** Check files this Step needs, named relative to the Track's `checks/` folder. */
  checks: string[];
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
  /** Lessons in the order the Track file lists them. */
  lessons: Lesson[];
}

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
  | { status: "ran"; results: CheckResult[]; done: boolean };

/** Learner progress. Plain JSON-safe data so a later ticket can save and restore it. */
export interface Progress {
  /** Ids of the Steps whose Checks have passed (or that were marked done). */
  doneSteps: string[];
}
