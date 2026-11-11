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
  /** Reserved: Check files this Step needs. Parsed, not run yet. */
  checks: string[];
  /** A Habit of the Track this Step's Code Chunk models. Shown as a callout. */
  habit?: string;
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
