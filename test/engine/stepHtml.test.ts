import { describe, expect, it } from "vitest";
import { renderReflectionHtml, renderStepHtml, renderTrackHtml } from "../../src/stepHtml";
import type { Lesson, Step, Track } from "../../src/engine";

const step: Step = {
  id: "l/1",
  title: "Say <hello>",
  explanation: "Explain **why**.",
  codeChunk: { language: "python", targetFile: "app/main.py", code: 'print("<hi>")' },
  checks: [],
};

describe("renderStepHtml habit callout", () => {
  it("shows the Habit as a callout between the explanation and the Code Chunk", () => {
    const html = renderStepHtml({ ...step, habit: "Small <functions>" });
    const at = (s: string) => html.indexOf(s);
    expect(html).toContain('class="habit-callout"');
    expect(html).toContain("Small &lt;functions&gt;");
    expect(at("<strong>why</strong>")).toBeLessThan(at("habit-callout"));
    expect(at("habit-callout")).toBeLessThan(at("print("));
  });

  it("shows no callout when the Step names no Habit", () => {
    expect(renderStepHtml(step)).not.toContain("habit-callout");
  });
});

describe("renderReflectionHtml", () => {
  const lesson: Lesson = {
    id: "01-first",
    title: "First <Lesson>",
    intro: "",
    steps: [step],
    reflection: ["Why keep the key in `.env`?", "Why keep functions small?"],
  };

  it("marks the Reflection as ungraded and optional, and lists its questions in order", () => {
    const html = renderReflectionHtml(lesson);
    expect(html).toMatch(/ungraded/i);
    expect(html).toMatch(/optional/i);
    expect(html.indexOf("Why keep the key")).toBeGreaterThan(-1);
    expect(html.indexOf("Why keep the key")).toBeLessThan(html.indexOf("Why keep functions small"));
  });

  it("renders question Markdown and escapes the Lesson title", () => {
    const html = renderReflectionHtml(lesson);
    expect(html).toContain("<code>.env</code>");
    expect(html).toContain("First &lt;Lesson&gt;");
  });
});

describe("renderTrackHtml", () => {
  const track: Track = {
    title: "Build <an> agent",
    habits: ["Keep secrets in .env", "Small <functions>"],
    lessons: [],
  };

  it("shows the Track title and its Habits as a list", () => {
    const html = renderTrackHtml(track);
    expect(html).toContain("Build &lt;an&gt; agent");
    expect(html).toContain("<li>Keep secrets in .env</li>");
    expect(html).toContain("<li>Small &lt;functions&gt;</li>");
  });

  it("says so when the Track names no Habits", () => {
    expect(renderTrackHtml({ ...track, habits: [] })).toMatch(/no Habits/);
  });
});

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
