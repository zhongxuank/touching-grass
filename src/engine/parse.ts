import { parse as parseYaml } from "yaml";
import type { CodeChunk, Lesson, Step, ValidationError } from "./types";

export interface TrackFile {
  title: string;
  habits: string[];
  lessonFiles: string[];
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
  if (errors.length) return { errors };
  return {
    value: { title: (data.title as string).trim(), habits: habits!, lessonFiles: lessonFiles! },
    errors: [],
  };
}

const STEP_HEADING = /^##\s+Step:\s*(.*?)\s*$/;
const REFLECTION_HEADING = /^##\s+Reflection\s*$/;
const ANY_H2 = /^##\s/;
const FENCE_OPEN = /^```(\S*)\s*(.*?)\s*$/;
const META_LINE = /^(provider|checks|habit):\s*(.*?)\s*$/;

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

function parseStep(
  file: string,
  lessonId: string,
  position: number,
  section: Section,
  title: string,
  habits: string[],
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
  let i = 0;
  while (i < before.length && (before[i]!.trim() === "" || META_LINE.test(before[i]!))) {
    const m = META_LINE.exec(before[i]!);
    if (m) {
      if (m[1] === "provider") provider = m[2]!;
      else if (m[1] === "habit") {
        if (!habits.includes(m[2]!)) {
          return fail(
            file,
            `Step "${title}": habit "${m[2]}" is not one of the Track's habits (${habits.join("; ") || "none listed"}).`,
            section.line + i + 1,
          );
        }
        habit = m[2]!;
      } else checks = m[2]!.split(",").map((c) => c.trim()).filter(Boolean);
    }
    i++;
  }
  const explanation = before.slice(i).join("\n").trim();
  if (!explanation) return fail(file, `Step "${title}" has no explanation: it must come before the Code Chunk.`, section.line);

  const codeChunk: CodeChunk = {
    language: open[1]!,
    targetFile: fileAttr[1]!,
    code: lines.slice(fenceAt + 1, closeAt).join("\n"),
  };
  const step: Step = { id: `${lessonId}/${position}`, title, explanation, codeChunk, checks };
  if (provider) step.provider = provider;
  if (habit) step.habit = habit;
  return { value: step, errors: [] };
}

/** Parse a Lesson file. `habits` is the Track's Habit list, which a Step's `habit:` line must name. */
export function parseLessonFile(file: string, lessonId: string, text: string, habits: string[] = []): Parsed<Lesson> {
  const fm = splitFrontMatter(text);
  if (!fm) return fail(file, "Missing front matter: a Lesson file starts with a --- block holding title.", 1);
  if (fm.data instanceof Error) return fail(file, `Front matter is not valid YAML: ${fm.data.message}`, 1);
  const title = (fm.data as Record<string, unknown> | null)?.title;
  if (typeof title !== "string" || !title.trim()) return fail(file, "Missing `title`.", 1);

  const { intro, sections } = splitSections(fm.body, fm.bodyStart);
  const errors: ValidationError[] = [];
  const steps: Step[] = [];
  let reflection: string[] = [];
  for (const section of sections) {
    const stepHeading = STEP_HEADING.exec(section.heading);
    if (stepHeading) {
      const stepTitle = stepHeading[1]!;
      if (!stepTitle) {
        errors.push({ file, line: section.line, message: "A Step heading needs a title: `## Step: <title>`." });
        continue;
      }
      const result = parseStep(file, lessonId, steps.length + 1, section, stepTitle, habits);
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
