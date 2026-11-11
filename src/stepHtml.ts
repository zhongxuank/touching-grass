import MarkdownIt from "markdown-it";
import type { Step } from "./engine";

const md = new MarkdownIt({ html: false, linkify: false });

const escape = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * Body of the Step panel: explanation first, then the Code Chunk, then its target file.
 * Pure string in, string out, so the shell stays free of domain logic.
 */
export function renderStepHtml(step: Step): string {
  return `<h1>${escape(step.title)}</h1>
<section class="explanation">${md.render(step.explanation)}</section>
<section class="code-chunk"><pre><code>${escape(step.codeChunk.code)}</code></pre></section>
<section class="target-file">Type this into <code>${escape(step.codeChunk.targetFile)}</code> in your agent project.</section>`;
}
