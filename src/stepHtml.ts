import MarkdownIt from "markdown-it";
import type { Lesson, Step, Track } from "./engine";

const md = new MarkdownIt({ html: false, linkify: false });

const escape = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * Body of the Step panel: explanation first, then the Habit callout (if any), then the Code Chunk,
 * then its target file. Pure string in, string out, so the shell stays free of domain logic.
 */
export function renderStepHtml(step: Step): string {
  const callout = step.habit
    ? `\n<aside class="habit-callout">Habit: <strong>${escape(step.habit)}</strong></aside>`
    : "";
  return `<h1>${escape(step.title)}</h1>
<section class="explanation">${md.render(step.explanation)}</section>${callout}
<section class="code-chunk"><pre><code>${escape(step.codeChunk.code)}</code></pre></section>
<section class="target-file">Type this into <code>${escape(step.codeChunk.targetFile)}</code> in your agent project.</section>`;
}

/** Body of the Reflection panel for a Lesson: ungraded, optional questions, rendered as Markdown. */
export function renderReflectionHtml(lesson: Lesson): string {
  const questions = lesson.reflection.map((q) => `- ${q}`).join("\n");
  return `<h1>Reflection: ${escape(lesson.title)}</h1>
<p class="reflection-note">Ungraded and optional. Answer in your own words; nothing here is checked or saved.</p>
<section class="reflection">${md.render(questions)}</section>`;
}

/** Body of the Track overview panel: the Track title and the Habits it models. */
export function renderTrackHtml(track: Track): string {
  const habits =
    track.habits.length === 0
      ? `<p>This Track names no Habits.</p>`
      : `<ul class="habits">${track.habits.map((h) => `<li>${escape(h)}</li>`).join("")}</ul>`;
  return `<h1>${escape(track.title)}</h1>
<h2>Habits</h2>
<p>Good engineering practices this Track models and calls out in its Steps.</p>
${habits}`;
}
