import MarkdownIt from "markdown-it";
import type { BuildsOnNotice, CodeChunk, Lesson, Page, StarterOutcome, Step, Track, TrackSession } from "./engine";

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
${renderCodeChunk(step.codeChunk)}`;
}

/**
 * The Code Chunk as a callout: a header saying whether the Learner creates the file or edits one an earlier
 * Step created, then where the code goes, then the code.
 */
export function renderCodeChunk(chunk: CodeChunk): string {
  const kind = chunk.newFile ? "New file" : "Edit file";
  const notes: string[] = [];
  if (chunk.place) notes.push(md.renderInline(chunk.place));
  else if (chunk.newFolder) notes.push(`Create the <code>${escape(chunk.newFolder)}/</code> folder, then this file in it.`);
  else if (chunk.newFile) notes.push("Create this file and type the code below into it.");
  return `<section class="chunk ${chunk.newFile ? "chunk-new" : "chunk-edit"}">
<header class="chunk-head"><span class="chunk-kind">${kind}</span> <code class="chunk-path">${escape(chunk.targetFile)}</code></header>
${notes.map((n) => `<p class="chunk-where">${n}</p>`).join("\n")}
<pre><code>${escape(chunk.code)}</code></pre>
</section>`;
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

/** Where a page sits in the Track: its header (Lesson, number, progress) and its Previous and Next buttons. */
export interface PageNav {
  lessonTitle: string;
  /** `1.5` for a Step, "Reflection" for a Reflection. */
  number: string;
  /** Done and total visible Steps in the Track. */
  done: number;
  total: number;
  /** Label without arrow, e.g. "1.4 Read keys". Absent on the first page. */
  previous?: { label: string };
  /** Absent on the last page. Disabled until the Step is done, with `disabledReason` as its tooltip. */
  next?: { label: string; enabled: boolean; disabledReason?: string };
}

const pageLabel = (session: TrackSession, page: Page): string =>
  page.kind === "reflection" ? "Reflection" : `${session.pageNumber(session.pageId(page))} ${page.step.title}`;

/** Header and footer data for a page, from the engine's page sequence. Undefined for an unknown page. */
export function pageNav(session: TrackSession, pageId: string): PageNav | undefined {
  const pages = session.getPages();
  const at = pages.findIndex((p) => session.pageId(p) === pageId);
  const page = pages[at];
  const number = session.pageNumber(pageId);
  if (!page || !number) return undefined;
  const lesson = page.kind === "step" ? session.track.lessons.find((l) => l.steps.includes(page.step))! : page.lesson;
  const previous = pages[at - 1];
  const following = pages[at + 1];
  const enabled = session.canGoNext(pageId);
  const reason =
    page.kind === "step" && page.step.checks.length
      ? "Pass this Step's Checks to continue."
      : "Mark this Step done to continue.";
  return {
    lessonTitle: lesson.title,
    number,
    ...session.progressCount(),
    ...(previous ? { previous: { label: pageLabel(session, previous) } } : {}),
    ...(following
      ? { next: { label: pageLabel(session, following), enabled, ...(enabled ? {} : { disabledReason: reason }) } }
      : {}),
  };
}

/** Panel title: "1.5 Call Claude", or "Reflection: <Lesson>". */
export function pageTitle(session: TrackSession, pageId: string): string | undefined {
  const page = session.getPages().find((p) => session.pageId(p) === pageId);
  if (!page) return undefined;
  return page.kind === "reflection" ? `Reflection: ${page.lesson.title}` : pageLabel(session, page);
}

/** Header bar: Lesson name, page number, progress bar, done count. */
function renderPageBar(nav: PageNav): string {
  const percent = nav.total ? Math.round((nav.done / nav.total) * 100) : 0;
  const where = nav.number === "Reflection" ? "Reflection" : `Step ${escape(nav.number)}`;
  return `<header class="page-bar"><span class="crumb">${escape(nav.lessonTitle)}</span><strong>${where}</strong>
<span class="progress" role="progressbar" aria-label="Steps done" aria-valuemin="0" aria-valuemax="${nav.total}" aria-valuenow="${nav.done}"><i style="width:${percent}%"></i></span>
<span class="crumb">${nav.done} / ${nav.total} done</span></header>`;
}

/** Footer: Previous and Next. Next is disabled, with a tooltip, until the Step is done. */
function renderPageFooter(nav: PageNav): string {
  const prev = nav.previous
    ? `<button class="secondary" data-action="previous">← ${escape(nav.previous.label)}</button>`
    : "<span></span>";
  const next = nav.next
    ? `<button data-action="next"${nav.next.enabled ? "" : ` disabled title="${escape(nav.next.disabledReason ?? "")}"`}>${escape(nav.next.label)} →</button>`
    : "<span></span>";
  return `<footer class="page-foot">${prev}${next}</footer>`;
}

/** What the Step panel shows beyond the Step itself. Plain data so the shell holds no domain logic. */
export interface PanelState {
  done: boolean;
  /** Header and Previous/Next footer. Left out, the panel has neither. */
  nav?: PageNav;
  /** Set when Run Checks has run; per-Check results. */
  results?: { check: string; passed: boolean; output: string }[];
  /** A notice such as "uv was not found" or "choose a workspace". */
  message?: string;
  /** True while Checks run: the panel says so and disables Run Checks. */
  running?: boolean;
  /** When the results were produced, shown as "Ran at HH:MM:SS" so a repeat failure is visibly a new run. */
  ranAt?: Date;
  /** Set when the Step is for a Provider the Learner has no key for: read-only, Checks skipped. */
  noKeyProvider?: string;
  /** Set when the Track builds on an earlier Track the Learner has not finished: shown above the Step. */
  buildsOn?: BuildsOnNotice;
}

/** The notice at the top of a Track that builds on another, with the button to start from its finished code. */
export function renderBuildsOnNotice(notice: BuildsOnNotice | undefined): string {
  if (!notice) return "";
  const title = escape(notice.title);
  if (notice.state === "missing") {
    return `<aside class="builds-on"><p>This Track continues ${title}, but that Track was not found next to this one, so there is no finished code to start from. Finish it first.</p></aside>\n`;
  }
  return `<aside class="builds-on"><p>This Track continues ${title}. Finish it first, or start from its finished code.</p>
<button data-action="startFromEarlier">Start from its finished code</button></aside>\n`;
}

/** What to tell the Learner after "Start from its finished code": what was copied, and what was left alone. */
export function describeStarterOutcome(outcome: StarterOutcome): string {
  switch (outcome.status) {
    case "no-workspace":
      return "Choose your agent workspace to copy the finished code into.";
    case "missing":
      return "The earlier Track was not found, so there is no finished code to copy.";
    case "no-reference":
      return "The earlier Track has no finished code (reference folder) to copy.";
    case "copied": {
      const files = (n: number) => `${n} ${n === 1 ? "file" : "files"}`;
      const copied = `Copied ${files(outcome.copied.length)} into your workspace.`;
      return outcome.skipped.length
        ? `${copied} Skipped ${files(outcome.skipped.length)} that already exist: ${outcome.skipped.join(", ")}.`
        : copied;
    }
  }
}

/** Opens Claude Code in the agent workspace as the Tutor. Shown on every Step. */
const TUTOR_BUTTON =
  '<section class="tutor"><button class="secondary" data-action="askTutor">Ask Claude about this Step</button></section>';

/** The Run it button for a Step with a `run:` line. Shown with or without Checks. */
function renderRun(command: string): string {
  return `<section class="run"><button data-action="runCommand">Run it: <code>${escape(command)}</code></button></section>`;
}

const pad2 = (n: number) => String(n).padStart(2, "0");
const localTime = (d: Date) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;

/** Controls and results below the Step: Run Checks (or Mark done) and results. */
export function renderPanelControls(step: Step, state: PanelState): string {
  const parts: string[] = [];
  if (state.noKeyProvider) {
    parts.push(
      `<p class="notice">No key for ${escape(state.noKeyProvider)}. Read along, your Checks are skipped.</p>`,
      TUTOR_BUTTON,
    );
    return parts.join("\n");
  }
  if (step.checks.length) {
    const ran = state.ranAt && state.results ? `\n<p class="ran-at">Ran at ${localTime(state.ranAt)}</p>` : "";
    parts.push(
      `<section class="checks"><h2>Checks</h2><ul>${step.checks
        .map((c) => {
          const r = state.results?.find((x) => x.check === c);
          const badge = r ? (r.passed ? '<span class="pass">passed</span>' : '<span class="fail">failed</span>') : "";
          return `<li><code>${escape(c)}</code> ${badge} <button class="link" data-action="openCheck" data-check="${escape(c)}">Open</button>${
            r && !r.passed ? `<pre class="output">${escape(r.output)}</pre>` : ""
          }</li>`;
        })
        .join("")}</ul>${ran}
<button data-action="runChecks"${state.running ? " disabled" : ""}>Run Checks</button>${
          state.running ? '\n<p class="notice running">Running Checks...</p>' : ""
        }</section>`,
    );
  } else if (!state.done) {
    parts.push(`<section class="checks"><p>This Step has no Checks.</p><button data-action="markDone">Mark done</button></section>`);
  }
  if (step.run) parts.push(renderRun(step.run));
  if (state.message) parts.push(`<p class="notice">${escape(state.message)}</p>`);
  if (state.done) parts.push('<p class="pass">Step done.</p>');
  parts.push(TUTOR_BUTTON);
  return parts.join("\n");
}

/** Full webview document with a strict CSP: only the one nonce'd script runs. Shared by every panel. */
export function renderDocument(body: string, nonce: string, cspSource: string, nav?: PageNav): string {
  const csp = `default-src 'none'; style-src ${cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';`;
  return `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<style>
  body { font-family: var(--vscode-font-family); padding: 1rem 1.5rem; line-height: 1.5; }
  pre { padding: 0.75rem; overflow-x: auto; background: var(--vscode-textCodeBlock-background); }
  .chunk { border: 1px solid var(--vscode-panel-border, #8884); border-left: 4px solid var(--chunk-accent); border-radius: 4px; margin: 1rem 0; overflow: hidden; }
  .chunk-new { --chunk-accent: var(--vscode-testing-iconPassed, #3a3); }
  .chunk-edit { --chunk-accent: var(--vscode-editorWarning-foreground, #c90); }
  .chunk-head { padding: 0.4rem 0.75rem; background: color-mix(in srgb, var(--chunk-accent) 14%, transparent); font-weight: 600; }
  .chunk-kind { color: var(--chunk-accent); margin-right: 0.35rem; }
  .chunk-where { margin: 0.5rem 0.75rem 0; }
  .chunk pre { margin: 0.5rem 0 0; border-radius: 0; }
  .pass { color: var(--vscode-testing-iconPassed, green); }
  .fail { color: var(--vscode-testing-iconFailed, red); }
  .output { white-space: pre-wrap; }
  .habit-callout { border-left: 3px solid var(--vscode-textLink-foreground); padding: 0.25rem 0.75rem; margin: 1rem 0; }
  .builds-on { border-left: 3px solid var(--vscode-editorWarning-foreground, #c90); padding: 0.25rem 0.75rem; margin: 0 0 1rem; }
  .tutor { margin-top: 1.5rem; padding-top: 0.75rem; border-top: 1px solid var(--vscode-panel-border, #8884); }
  .run { margin: 1rem 0; }
  .reflection-note { opacity: 0.8; font-style: italic; }
  .page-bar { display: flex; flex-wrap: wrap; align-items: center; gap: 0.4rem 1rem; padding: 0.6rem 0; margin-bottom: 0.5rem; border-bottom: 1px solid var(--vscode-panel-border, #8884); }
  .page-bar .crumb { color: var(--vscode-descriptionForeground); }
  .progress { flex: 1; min-width: 120px; height: 6px; border-radius: 3px; overflow: hidden; background: color-mix(in srgb, var(--vscode-editor-foreground) 18%, transparent); }
  .progress i { display: block; height: 100%; background: var(--vscode-progressBar-background, var(--vscode-testing-iconPassed, #3a3)); }
  .page-foot { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 0.5rem; margin-top: 2rem; padding-top: 0.75rem; border-top: 1px solid var(--vscode-panel-border, #8884); }
  button { font-family: inherit; font-size: var(--vscode-font-size); background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: 1px solid var(--vscode-button-border, transparent); border-radius: 2px; padding: 4px 12px; cursor: pointer; }
  button:hover:not(:disabled) { background: var(--vscode-button-hoverBackground); }
  button.secondary { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
  button.secondary:hover:not(:disabled) { background: var(--vscode-button-secondaryHoverBackground); }
  button:focus-visible { outline: 1px solid var(--vscode-focusBorder); outline-offset: 2px; }
  button:disabled { opacity: 0.5; cursor: not-allowed; }
  button.link { background: none; color: var(--vscode-textLink-foreground); padding: 0; border: none; }
</style></head><body>${nav ? renderPageBar(nav) : ""}${body}${nav ? renderPageFooter(nav) : ""}
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
  const body = `${renderBuildsOnNotice(state.buildsOn)}${renderStepHtml(step)}\n${renderPanelControls(step, state)}`;
  return renderDocument(body, nonce, cspSource, state.nav);
}

/** The Reflection panel document: no Step controls, but the same header and footer. */
export function renderReflectionDocument(lesson: Lesson, nonce: string, cspSource: string, nav?: PageNav): string {
  return renderDocument(renderReflectionHtml(lesson), nonce, cspSource, nav);
}

/** The Track overview panel document: no Step controls. */
export function renderTrackDocument(track: Track, nonce: string, cspSource: string, buildsOn?: BuildsOnNotice): string {
  return renderDocument(`${renderBuildsOnNotice(buildsOn)}${renderTrackHtml(track)}`, nonce, cspSource);
}
