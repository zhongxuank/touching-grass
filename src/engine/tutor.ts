import { promises as fs } from "node:fs";
import * as path from "node:path";
import { PROGRESS_DIR, PROGRESS_FILE } from "./progress";
import type { CheckResult, Step } from "./types";

/**
 * The Tutor: an AI assistant (Claude Code) the Learner runs in their agent workspace to ask questions.
 * The extension never calls an LLM (ADR 0003). It only writes files the Tutor reads:
 * a guide that tells it how to help, and the current Step. Pure Node: no vscode import.
 */

/** The Tutor guide, inside PROGRESS_DIR. Rewritten whenever a workspace is chosen. */
export const TUTOR_GUIDE_FILE = "tutor.md";
/** The current Step as Markdown, inside PROGRESS_DIR. Rewritten whenever a Step opens or its Checks run. */
export const CURRENT_STEP_FILE = "current-step.md";
/** Claude Code reads this file at the workspace root. We only add one import line to it. */
export const CLAUDE_MD = "CLAUDE.md";
export const TUTOR_IMPORT_LINE = `@${PROGRESS_DIR}/${TUTOR_GUIDE_FILE}`;

/** The first question sent to the Tutor when the Learner asks about a Step from the panel. */
export const TUTOR_PROMPT = `I am working on the Step in ${PROGRESS_DIR}/${CURRENT_STEP_FILE}. Read it and the file it targets, then ask me what I would like help with.`;

/** What the Tutor needs to know about the Track. */
export interface TutorTrackInfo {
  trackTitle: string;
  /** Absolute path of the Track folder. */
  trackFolder: string;
}

export function renderTutorGuide(info: TutorTrackInfo): string {
  return `# Tutor guide (written by touching grass)

This folder is a Learner's agent project. They are following the touching grass Track "${info.trackTitle}"
and typing every Code Chunk by hand, so that they learn it. You are their tutor, not their pair programmer.

## Where things are

- \`${PROGRESS_DIR}/${CURRENT_STEP_FILE}\`: the Step they are on, with its explanation, Code Chunk, Checks and
  the last Check results. It changes as they move on, so read it again before every answer.
- \`${PROGRESS_DIR}/${PROGRESS_FILE}\`: which Steps are done.
- The Track itself, read-only: \`${info.trackFolder}\` (\`lessons/\` has every Step, \`checks/\` the pytest Checks).

## How to help

- Answer questions about the current Step: what each line does, why it is written that way, and the ideas
  behind it (the API, tool calling, the agent loop). Use the Step's own explanation and words.
- Do not write, edit or paste the Code Chunk into their files. Typing it is the point. Do not edit their
  files at all unless they ask for one specific change that is not the Code Chunk.
- When their code or a Check fails, point to the line and explain the cause. Give a hint first. Show the
  smallest fix for them to type only if they are still stuck after the hint.
- Stay on the current Step. Do not jump ahead to later Steps unless they ask.
- Never print the values in \`.env\`. Saying whether a key is set is fine.
- Keep answers short. If the question is unclear, ask what they have tried.
`;
}

/** The current Step as Markdown, with the last Check results when Checks have run. */
export function renderCurrentStep(step: Step, results?: CheckResult[]): string {
  const meta = [
    `- Step id: \`${step.id}\``,
    `- ${step.codeChunk.newFile ? "New file" : "Edit file"}: \`${step.codeChunk.targetFile}\``,
    step.codeChunk.newFolder ? `- Creates the folder: \`${step.codeChunk.newFolder}/\`` : undefined,
    step.codeChunk.place ? `- Where: ${step.codeChunk.place}` : undefined,
    step.provider ? `- Provider: ${step.provider}` : undefined,
    step.habit ? `- Habit: ${step.habit}` : undefined,
    step.checks.length ? `- Checks: ${step.checks.map((c) => `\`${c}\``).join(", ")}` : "- Checks: none",
  ].filter((line) => line !== undefined);
  const fence = step.codeChunk.code.includes("```") ? "````" : "```";
  let text = `# Current Step: ${step.title}

${meta.join("\n")}

## Explanation

${step.explanation.trim()}

## Code Chunk

${fence}${step.codeChunk.language}
${step.codeChunk.code.replace(/\n$/, "")}
${fence}
`;
  if (results?.length) {
    text += `\n## Last Check results\n`;
    for (const r of results) {
      text += `\n- \`${r.check}\`: ${r.passed ? "passed" : "failed"}\n`;
      if (!r.passed && r.output.trim()) text += `\n\`\`\`text\n${r.output.trim()}\n\`\`\`\n`;
    }
  }
  return text;
}

/**
 * The workspace CLAUDE.md with the Tutor import added, or undefined when it already imports the guide.
 * The Learner's own CLAUDE.md content is kept as it is.
 */
export function withTutorImport(existing: string | undefined): string | undefined {
  if (existing === undefined) {
    return `# Agent project\n\nGuidance for Claude Code, added by touching grass:\n\n${TUTOR_IMPORT_LINE}\n`;
  }
  if (existing.split(/\r?\n/).some((line) => line.trim() === TUTOR_IMPORT_LINE)) return undefined;
  const sep = existing.length === 0 || existing.endsWith("\n") ? "" : "\n";
  return `${existing}${sep}\n${TUTOR_IMPORT_LINE}\n`;
}

async function readIfExists(file: string): Promise<string | undefined> {
  try {
    return await fs.readFile(file, "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw e;
  }
}

/** Write the Tutor guide and make the workspace CLAUDE.md import it. Resolves with a message on failure. */
export async function writeTutorGuide(workspace: string, info: TutorTrackInfo): Promise<string | undefined> {
  try {
    await fs.mkdir(path.join(workspace, PROGRESS_DIR), { recursive: true });
    await fs.writeFile(path.join(workspace, PROGRESS_DIR, TUTOR_GUIDE_FILE), renderTutorGuide(info));
    const claudeMd = path.join(workspace, CLAUDE_MD);
    const updated = withTutorImport(await readIfExists(claudeMd));
    if (updated !== undefined) await fs.writeFile(claudeMd, updated);
    return undefined;
  } catch (e) {
    return `Could not write the Tutor guide: ${(e as Error).message}`;
  }
}

/** Write the current Step for the Tutor. Resolves with a message on failure. */
export async function writeCurrentStep(
  workspace: string,
  step: Step,
  results?: CheckResult[],
): Promise<string | undefined> {
  try {
    await fs.mkdir(path.join(workspace, PROGRESS_DIR), { recursive: true });
    await fs.writeFile(path.join(workspace, PROGRESS_DIR, CURRENT_STEP_FILE), renderCurrentStep(step, results));
    return undefined;
  } catch (e) {
    return `Could not write the current Step for the Tutor: ${(e as Error).message}`;
  }
}
