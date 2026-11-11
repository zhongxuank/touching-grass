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

/** What the Step panel shows beyond the Step itself. Plain data so the shell holds no domain logic. */
export interface PanelState {
  done: boolean;
  hasNext: boolean;
  /** Set when Run Checks has run; per-Check results. */
  results?: { check: string; passed: boolean; output: string }[];
  /** A notice such as "uv was not found" or "choose a workspace". */
  message?: string;
  /** An earlier done Step, opened to re-read: no Run Checks or Mark done. Next Step still works. */
  readOnly?: boolean;
  /** Set when the Step is for a Provider the Learner has no key for: read-only, Checks skipped. */
  noKeyProvider?: string;
}

/** Controls and results below the Step: Run Checks (or Mark done), results, Next Step. */
export function renderPanelControls(step: Step, state: PanelState): string {
  const parts: string[] = [];
  if (state.noKeyProvider) {
    parts.push(
      `<p class="notice">No key for ${escape(state.noKeyProvider)}. Read along, your Checks are skipped.</p>`,
      state.hasNext ? '<button data-action="next">Next Step</button>' : "<p>That was the last Step.</p>",
    );
    return parts.join("\n");
  }
  if (step.checks.length) {
    parts.push(
      `<section class="checks"><h2>Checks</h2><ul>${step.checks
        .map((c) => {
          const r = state.results?.find((x) => x.check === c);
          const badge = r ? (r.passed ? '<span class="pass">passed</span>' : '<span class="fail">failed</span>') : "";
          return `<li><code>${escape(c)}</code> ${badge} <button class="link" data-action="openCheck" data-check="${escape(c)}">Open</button>${
            r && !r.passed ? `<pre class="output">${escape(r.output)}</pre>` : ""
          }</li>`;
        })
        .join("")}</ul>${state.readOnly ? "" : '\n<button data-action="runChecks">Run Checks</button>'}</section>`,
    );
  } else if (!state.done && !state.readOnly) {
    parts.push(`<section class="checks"><p>This Step has no Checks.</p><button data-action="markDone">Mark done</button></section>`);
  }
  if (state.message) parts.push(`<p class="notice">${escape(state.message)}</p>`);
  if (state.done) {
    parts.push(
      `<p class="pass">Step done.</p>${state.hasNext ? '<button data-action="next">Next Step</button>' : "<p>That was the last Step.</p>"}`,
    );
  }
  return parts.join("\n");
}

/** Full webview document with a strict CSP: only the one nonce'd script runs. Shared by every panel. */
export function renderDocument(body: string, nonce: string, cspSource: string): string {
  const csp = `default-src 'none'; style-src ${cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';`;
  return `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<style>
  body { font-family: var(--vscode-font-family); padding: 1rem 1.5rem; line-height: 1.5; }
  pre { padding: 0.75rem; overflow-x: auto; background: var(--vscode-textCodeBlock-background); }
  .target-file { opacity: 0.8; }
  .pass { color: var(--vscode-testing-iconPassed, green); }
  .fail { color: var(--vscode-testing-iconFailed, red); }
  button.link { background: none; border: none; color: var(--vscode-textLink-foreground); cursor: pointer; padding: 0; }
  .output { white-space: pre-wrap; }
  .habit-callout { border-left: 3px solid var(--vscode-textLink-foreground); padding: 0.25rem 0.75rem; margin: 1rem 0; }
  .reflection-note { opacity: 0.8; font-style: italic; }
</style></head><body>${body}
<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-action]");
    if (el) vscode.postMessage({ action: el.dataset.action, check: el.dataset.check });
  });
</script></body></html>`;
}

/** The Step panel document: the Step, then its controls and results. */
export function renderPanelDocument(step: Step, state: PanelState, nonce: string, cspSource: string): string {
  return renderDocument(`${renderStepHtml(step)}\n${renderPanelControls(step, state)}`, nonce, cspSource);
}

/** The Reflection panel document: no Step controls. */
export function renderReflectionDocument(lesson: Lesson, nonce: string, cspSource: string): string {
  return renderDocument(renderReflectionHtml(lesson), nonce, cspSource);
}

/** The Track overview panel document: no Step controls. */
export function renderTrackDocument(track: Track, nonce: string, cspSource: string): string {
  return renderDocument(renderTrackHtml(track), nonce, cspSource);
}
