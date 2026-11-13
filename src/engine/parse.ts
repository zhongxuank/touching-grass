import * as path from "node:path";
import { parse as parseYaml } from "yaml";
import { isProvider, PROVIDERS } from "./providers";
import type { CodeChunk, Lesson, Step, StepCopy, ValidationError } from "./types";

export interface ParseLessonOptions {
  /** Check files that exist in the Track's `checks/` folder, relative to it. Omit to skip the check. */
  checkFiles?: ReadonlySet<string>;
  /** The Track's Habits, which a Step's `habit:` line must name. Omit to skip the check. */
  habits?: readonly string[];
  /**
   * Target files written by earlier Steps, in Track order. Parsing adds this Lesson's files to it, so pass the
   * same set to each Lesson in turn. Decides whether a Code Chunk creates a new file. Defaults to an empty set.
   */
  seenFiles?: Set<string>;
  /** Whether a folder (relative to the Track folder) exists, for a Step's `copy:` source. Omit to skip the check. */
  folderExists?: (relativeFolder: string) => boolean;
}

export interface TrackFile {
  title: string;
  habits: string[];
  lessonFiles: string[];
  /** Title of the Track this one continues, from `builds_on:`. */
  buildsOn?: string;
}

type Parsed<T> = { value: T; errors: [] } | { value?: undefined; errors: ValidationError[] };

interface FrontMatter {
  data: unknown;
  /** Zero-based index of the first body line within the file. */
  bodyStart: number;
  body: string[];
}

function splitFrontMatter(text: string): FrontMatter | undefined {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  if (lines[0]?.trim() !== "---") return undefined;
  const end = lines.findIndex((l, i) => i > 0 && l.trim() === "---");
  if (end === -1) return undefined;
  let data: unknown;
  try {
    data = parseYaml(lines.slice(1, end).join("\n"));
  } catch (e) {
    data = e instanceof Error ? e : new Error(String(e));
  }
  return { data, bodyStart: end + 1, body: lines.slice(end + 1) };
}

function fail(file: string, message: string, line?: number): { errors: ValidationError[] } {
  return { errors: [line === undefined ? { file, message } : { file, line, message }] };
}

function stringList(value: unknown): string[] | undefined {
  if (value === undefined || value === null) return [];
  if (Array.isArray(value) && value.every((v) => typeof v === "string")) return value as string[];
  return undefined;
}

/** Entries of the `lessons:` list in the front matter, with their one-based line numbers. */
function lessonListEntries(text: string): { value: string; line: number }[] {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const entries: { value: string; line: number }[] = [];
  let inList = false;
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]!;
    if (line.trim() === "---") break;
    if (/^lessons:/.test(line)) {
      inList = true;
      continue;
    }
    const item = /^\s*-\s*(.*?)\s*$/.exec(line);
    if (inList && item) {
      entries.push({ value: item[1]!.replace(/^["']|["']$/g, ""), line: i + 1 });
    } else if (line.trim() !== "") {
      inList = false;
    }
  }
  return entries;
}

/**
 * Checks the `lessons` list as a whole: each Lesson file is listed once, and no two Lesson files
 * share an id (file name without extension), since Step ids are built from that id.
 */
export function checkLessonFileList(file: string, text: string, lessonFiles: string[]): ValidationError[] {
  const errors: ValidationError[] = [];
  const entries = lessonListEntries(text);
  const lineOf = (index: number) => entries[index]?.line ?? 1;
  const firstLine = new Map<string, number>();
  const idOwner = new Map<string, string>();
  lessonFiles.forEach((rel, index) => {
    const key = path.posix.normalize(rel);
    if (firstLine.has(key)) {
      errors.push({
        file,
        line: lineOf(index),
        message: `"${rel}" is listed twice. List each Lesson file once, in the order to follow: remove this line.`,
      });
      return;
    }
    firstLine.set(key, lineOf(index));
    const id = path.posix.basename(key, path.posix.extname(key));
    const owner = idOwner.get(id);
    if (owner !== undefined) {
      errors.push({
        file,
        line: lineOf(index),
        message: `"${rel}" and "${owner}" both have the Lesson id "${id}" (the file name without its extension). Step ids are built from it, so rename one of the files to a unique name.`,
      });
    } else {
      idOwner.set(id, rel);
    }
  });
  return errors;
}

export function parseTrackFile(file: string, text: string): Parsed<TrackFile> {
  const fm = splitFrontMatter(text);
  if (!fm) return fail(file, "Missing front matter: a Track file starts with a --- block holding title and lessons.", 1);
  if (fm.data instanceof Error) return fail(file, `Front matter is not valid YAML: ${fm.data.message}`, 1);
  const data = (fm.data ?? {}) as Record<string, unknown>;
  const errors: ValidationError[] = [];
  if (typeof data.title !== "string" || !data.title.trim()) errors.push({ file, line: 1, message: "Missing `title`." });
  const habits = stringList(data.habits);
  if (!habits) errors.push({ file, line: 1, message: "`habits` must be a list of strings." });
  const lessonFiles = stringList(data.lessons);
  if (!lessonFiles || lessonFiles.length === 0) {
    errors.push({ file, line: 1, message: "`lessons` must list at least one Lesson file, in order." });
  }
  const buildsOn = data.builds_on;
  if (buildsOn !== undefined && buildsOn !== null && (typeof buildsOn !== "string" || !buildsOn.trim())) {
    errors.push({ file, line: 1, message: "`builds_on` must be the title of another Track, as a string." });
  }
  if (errors.length) return { errors };
  return {
    value: {
      title: (data.title as string).trim(),
      habits: habits!,
      lessonFiles: lessonFiles!,
      ...(typeof buildsOn === "string" ? { buildsOn: buildsOn.trim() } : {}),
    },
    errors: [],
  };
}

const STEP_HEADING = /^##\s+Step:\s*(.*?)\s*$/;
const REFLECTION_HEADING = /^##\s+Reflection\s*$/;
const ANY_H2 = /^##\s/;
const FENCE_OPEN = /^```(\S*)\s*(.*?)\s*$/;
const META_LINE = /^(provider|checks|habit|place|run|copy):\s*(.*?)\s*$/;

interface Section {
  heading: string;
  /** One-based line number of the heading in the file. */
  line: number;
  lines: string[];
}

/** Split a Lesson body into its intro and `##` sections, ignoring `##` inside fenced code. */
function splitSections(body: string[], bodyStart: number) {
  const intro: string[] = [];
  const sections: Section[] = [];
  let inFence = false;
  body.forEach((text, i) => {
    if (text.startsWith("```")) inFence = !inFence;
    if (!inFence && ANY_H2.test(text)) {
      sections.push({ heading: text, line: bodyStart + i + 1, lines: [] });
    } else if (sections.length) {
      sections[sections.length - 1]!.lines.push(text);
    } else {
      intro.push(text);
    }
  });
  return { intro: intro.join("\n").trim(), sections };
}

/** A folder path from a `copy:` line, normalised, or a message saying why it is not allowed. */
function copyFolder(raw: string, what: string): { folder: string } | { error: string } {
  if (!raw) return { error: `the ${what} folder is empty.` };
  if (raw.startsWith("/") || raw.startsWith("\\") || /^[a-zA-Z]:/.test(raw)) {
    return { error: `the ${what} folder "${raw}" must be relative, not an absolute path.` };
  }
  if (raw.split(/[\\/]/).includes("..")) return { error: `the ${what} folder "${raw}" must not contain "..".` };
  const folder = path.posix.normalize(raw.replace(/\\/g, "/")).replace(/\/$/, "");
  return { folder: folder || "." };
}

function parseStep(
  file: string,
  lessonId: string,
  position: number,
  section: Section,
  title: string,
  options: ParseLessonOptions,
  seenFiles: Set<string>,
): Parsed<Step> {
  const lines = section.lines;
  const fenceAt = lines.findIndex((l) => l.startsWith("```"));
  if (fenceAt === -1) {
    return fail(file, `Step "${title}" has no Code Chunk: add a fenced code block after the explanation.`, section.line);
  }
  const fenceLine = section.line + fenceAt + 1;
  const open = FENCE_OPEN.exec(lines[fenceAt]!)!;
  const fileAttr = /(?:^|\s)file=(\S+)/.exec(open[2]!);
  if (!fileAttr) {
    return fail(file, `Step "${title}": the Code Chunk fence needs a target file, like \`\`\`python file=app/main.py.`, fenceLine);
  }
  const closeAt = lines.findIndex((l, i) => i > fenceAt && l.trim() === "```");
  if (closeAt === -1) return fail(file, `Step "${title}": the Code Chunk is never closed with \`\`\`.`, fenceLine);
  const trailing = lines.slice(closeAt + 1).findIndex((l) => l.trim() !== "");
  if (trailing !== -1) {
    return fail(file, `Step "${title}": nothing may follow the Code Chunk.`, section.line + closeAt + 2 + trailing);
  }

  const before = lines.slice(0, fenceAt);
  let provider: string | undefined;
  let checks: string[] = [];
  let habit: string | undefined;
  let place: string | undefined;
  let run: string | undefined;
  let copy: StepCopy | undefined;
  let i = 0;
  while (i < before.length && (before[i]!.trim() === "" || META_LINE.test(before[i]!))) {
    const m = META_LINE.exec(before[i]!);
    if (m) {
      if (m[1] === "provider") {
        if (!isProvider(m[2]!)) {
          return fail(
            file,
            `Step "${title}": unknown Provider "${m[2]}". Use one of: ${PROVIDERS.join(", ")}.`,
            section.line + i + 1,
          );
        }
        provider = m[2]!;
      }
      else if (m[1] === "habit") {
        const habits = options.habits;
        if (habits && !habits.includes(m[2]!)) {
          return fail(
            file,
            `Step "${title}": habit "${m[2]}" is not one of the Track's habits (${habits.join("; ") || "none listed"}).`,
            section.line + i + 1,
          );
        }
        habit = m[2]!;
      } else if (m[1] === "run") {
        if (!m[2]) {
          return fail(file, `Step "${title}": \`run:\` needs a command, like \`run: uv run python main.py\`.`, section.line + i + 1);
        }
        run = m[2];
      } else if (m[1] === "copy") {
        const line = section.line + i + 1;
        const usage = "`copy:` is written like `copy: assets/pdfs -> sources` (a Track folder, then a workspace folder).";
        const parts = m[2]!.split("->");
        if (parts.length !== 2) return fail(file, `Step "${title}": ${usage}`, line);
        const from = copyFolder(parts[0]!.trim(), "Track");
        if ("error" in from) return fail(file, `Step "${title}": \`copy:\` ${from.error} ${usage}`, line);
        const to = copyFolder(parts[1]!.trim(), "workspace");
        if ("error" in to) return fail(file, `Step "${title}": \`copy:\` ${to.error} ${usage}`, line);
        if (options.folderExists && !options.folderExists(from.folder)) {
          return fail(
            file,
            `Step "${title}": \`copy:\` names the Track folder "${from.folder}", but it does not exist in the Track. Create it and put the files to copy in it, or fix the name.`,
            line,
          );
        }
        copy = { from: from.folder, to: to.folder };
      } else if (m[1] === "place") {
        if (m[2]) place = m[2];
      } else checks = m[2]!.split(",").map((c) => c.trim()).filter(Boolean);
    }
    i++;
  }
  const explanation = before.slice(i).join("\n").trim();
  if (!explanation) return fail(file, `Step "${title}" has no explanation: it must come before the Code Chunk.`, section.line);

  const code = lines.slice(fenceAt + 1, closeAt).join("\n");
  if (!code.trim()) {
    return fail(
      file,
      `Step "${title}": the Code Chunk is empty. Put the code the Learner types between the fences.`,
      fenceLine,
    );
  }

  if (options.checkFiles) {
    const checksLine = section.line + before.findIndex((l) => META_LINE.exec(l)?.[1] === "checks") + 1;
    for (const name of checks) {
      if (!options.checkFiles.has(name)) {
        return fail(
          file,
          `Step "${title}" lists Check file "${name}", but checks/${name} does not exist in the Track. Create it in the Track's checks/ folder, or fix the name in \`checks:\`.`,
          checksLine,
        );
      }
    }
  }

  const targetFile = path.posix.normalize(fileAttr[1]!);
  const newFile = !seenFiles.has(targetFile);
  if (!newFile && !place) {
    return fail(
      file,
      `Step "${title}": an earlier Step already creates ${targetFile}, so say where this code goes with a \`place:\` line, like \`place: Replace the whole file\` or \`place: Add below ask()\`.`,
      fenceLine,
    );
  }
  const folder = path.posix.dirname(targetFile);
  const folderIsNew = folder !== "." && ![...seenFiles].some((f) => f.startsWith(`${folder}/`));
  seenFiles.add(targetFile);

  const codeChunk: CodeChunk = { language: open[1]!, targetFile: fileAttr[1]!, code, newFile };
  if (folderIsNew) codeChunk.newFolder = folder;
  if (place) codeChunk.place = place;
  const step: Step = { id: `${lessonId}/${position}`, title, explanation, codeChunk, checks };
  if (provider) step.provider = provider;
  if (habit) step.habit = habit;
  if (run) step.run = run;
  if (copy) step.copy = copy;
  return { value: step, errors: [] };
}

export function parseLessonFile(
  file: string,
  lessonId: string,
  text: string,
  options: ParseLessonOptions = {},
): Parsed<Lesson> {
  const fm = splitFrontMatter(text);
  if (!fm) return fail(file, "Missing front matter: a Lesson file starts with a --- block holding title.", 1);
  if (fm.data instanceof Error) return fail(file, `Front matter is not valid YAML: ${fm.data.message}`, 1);
  const title = (fm.data as Record<string, unknown> | null)?.title;
  if (typeof title !== "string" || !title.trim()) return fail(file, "Missing `title`.", 1);

  const { intro, sections } = splitSections(fm.body, fm.bodyStart);
  const errors: ValidationError[] = [];
  const steps: Step[] = [];
  const seenFiles = options.seenFiles ?? new Set<string>();
  let reflection: string[] = [];
  for (const section of sections) {
    const stepHeading = STEP_HEADING.exec(section.heading);
    if (stepHeading) {
      const stepTitle = stepHeading[1]!;
      if (!stepTitle) {
        errors.push({ file, line: section.line, message: "A Step heading needs a title: `## Step: <title>`." });
        continue;
      }
      const result = parseStep(file, lessonId, steps.length + 1, section, stepTitle, options, seenFiles);
      if (result.value) steps.push(result.value);
      else errors.push(...result.errors);
    } else if (REFLECTION_HEADING.test(section.heading)) {
      reflection = section.lines
        .map((l) => /^\s*[-*]\s+(.*\S)\s*$/.exec(l)?.[1])
        .filter((q): q is string => q !== undefined);
    } else {
      errors.push({ file, line: section.line, message: `Unknown section "${section.heading}": use "## Step: <title>" or "## Reflection".` });
    }
  }
  if (!errors.length && steps.length === 0) errors.push({ file, message: "A Lesson needs at least one Step." });
  if (errors.length) return { errors };
  return { value: { id: lessonId, title: title.trim(), intro, steps, reflection }, errors: [] };
}
