import { describe, expect, it } from "vitest";
import { renderStepHtml } from "../../src/stepHtml";
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
