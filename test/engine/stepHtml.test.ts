import { describe, expect, it } from "vitest";
import { renderPanelControls, renderPanelDocument, renderStepHtml } from "../../src/stepHtml";
import type { Step } from "../../src/engine";

const step: Step = {
  id: "l/1",
  title: "Say <hello>",
  explanation: "Explain **why**.",
  codeChunk: { language: "python", targetFile: "app/main.py", code: 'print("<hi>")' },
  checks: [],
};

describe("renderStepHtml", () => {
  it("shows the explanation, then the Code Chunk, then the target file", () => {
    const html = renderStepHtml(step);
    const at = (s: string) => html.indexOf(s);
    expect(at("<strong>why</strong>")).toBeGreaterThan(-1);
    expect(at("<strong>why</strong>")).toBeLessThan(at("print("));
    expect(at("print(")).toBeLessThan(at("app/main.py"));
  });

  it("escapes the Code Chunk and title", () => {
    const html = renderStepHtml(step);
    expect(html).toContain("print(&quot;&lt;hi&gt;&quot;)");
    expect(html).toContain("Say &lt;hello&gt;");
  });
});

describe("Step panel", () => {
  const withChecks: Step = { ...step, checks: ["test_a.py", "test_b.py"] };

  it("has a strict CSP allowing only the nonce'd script", () => {
    const html = renderPanelDocument(step, { done: false, hasNext: false }, "abc123", "vscode-resource:");
    expect(html).toContain("default-src 'none'");
    expect(html).toContain("script-src 'nonce-abc123'");
    expect(html).toContain('<script nonce="abc123">');
  });

  it("lists each Check with its result and failure output, and lets the Learner open it", () => {
    const html = renderPanelControls(withChecks, {
      done: false,
      hasNext: true,
      results: [
        { check: "test_a.py", passed: true, output: "" },
        { check: "test_b.py", passed: false, output: "assert <1> == 2" },
      ],
    });
    expect(html).toContain('data-action="runChecks"');
    expect(html).toContain('data-action="openCheck" data-check="test_b.py"');
    expect(html).toContain("assert &lt;1&gt; == 2");
    expect(html).not.toContain("Next Step");
  });

  it("offers Next Step once the Step is done", () => {
    expect(renderPanelControls(withChecks, { done: true, hasNext: true })).toContain('data-action="next"');
  });

  it("offers Mark done for a Step with no Checks", () => {
    const html = renderPanelControls(step, { done: false, hasNext: true });
    expect(html).toContain('data-action="markDone"');
    expect(html).not.toContain("Run Checks");
  });

  it("hides Run Checks and Mark done on a read-only done Step, but keeps Next Step", () => {
    const withChecksHtml = renderPanelControls(withChecks, { done: true, hasNext: true, readOnly: true });
    expect(withChecksHtml).not.toContain("Run Checks");
    expect(withChecksHtml).toContain('data-action="next"');
    const noChecksHtml = renderPanelControls(step, { done: true, hasNext: true, readOnly: true });
    expect(noChecksHtml).not.toContain("markDone");
    expect(noChecksHtml).toContain('data-action="next"');
  });
});
