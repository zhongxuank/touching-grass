import { describe, expect, it } from "vitest";
import {
  renderPanelControls,
  renderPanelDocument,
  renderReflectionDocument,
  renderReflectionHtml,
  renderStepHtml,
  renderTrackDocument,
  renderTrackHtml,
  renderCodeChunk,
} from "../../src/stepHtml";
import type { Lesson, Step, Track } from "../../src/engine";

const step: Step = {
  id: "l/1",
  title: "Say <hello>",
  explanation: "Explain **why**.",
  codeChunk: { language: "python", targetFile: "app/main.py", code: 'print("<hi>")', newFile: true },
  checks: [],
};

describe("renderCodeChunk", () => {
  const chunk = step.codeChunk;

  it("marks a new file, and the folder to create when it is new too", () => {
    const html = renderCodeChunk({ ...chunk, newFolder: "app" });
    expect(html).toContain('class="chunk chunk-new"');
    expect(html).toContain(">New file<");
    expect(html).toContain("Create the <code>app/</code> folder, then this file in it.");
  });

  it("marks an edit and says where the code goes, rendering inline Markdown", () => {
    const html = renderCodeChunk({ ...chunk, newFile: false, place: "Add below `greet()`" });
    expect(html).toContain('class="chunk chunk-edit"');
    expect(html).toContain(">Edit file<");
    expect(html).toContain("Add below <code>greet()</code>");
    expect(html).not.toContain("folder");
  });

  it("escapes the path", () => {
    expect(renderCodeChunk({ ...chunk, targetFile: "a/<b>.py" })).toContain("a/&lt;b&gt;.py");
  });
});

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
  it("shows the explanation, then the Code Chunk under a header naming its file", () => {
    const html = renderStepHtml(step);
    const at = (s: string) => html.indexOf(s);
    expect(at("<strong>why</strong>")).toBeGreaterThan(-1);
    expect(at("<strong>why</strong>")).toBeLessThan(at("app/main.py"));
    expect(at("app/main.py")).toBeLessThan(at("print("));
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

  it("offers Ask Claude on every Step, including read-only and keyless ones", () => {
    for (const state of [
      { done: false, hasNext: true },
      { done: true, hasNext: true },
      { done: false, hasNext: true, noKeyProvider: "openai" },
    ]) {
      expect(renderPanelControls(withChecks, state)).toContain('data-action="askTutor"');
    }
  });

  it("offers Next Step once the Step is done", () => {
    expect(renderPanelControls(withChecks, { done: true, hasNext: true })).toContain('data-action="next"');
  });

  it("gives Reflection and overview panels the same CSP document but no Step controls", () => {
    const lesson: Lesson = { id: "l", title: "L", intro: "", steps: [step], reflection: ["Why?"] };
    const track: Track = { title: "T", habits: ["H"], lessons: [lesson] };
    for (const html of [
      renderReflectionDocument(lesson, "abc123", "vscode-resource:"),
      renderTrackDocument(track, "abc123", "vscode-resource:"),
    ]) {
      expect(html).toContain("script-src 'nonce-abc123'");
      expect(html).not.toContain('data-action="');
    }
  });

  it("offers Mark done for a Step with no Checks", () => {
    const html = renderPanelControls(step, { done: false, hasNext: true });
    expect(html).toContain('data-action="markDone"');
    expect(html).not.toContain("Run Checks");
  });

  it("keeps Run Checks and Next Step on a done Step so its Checks can be re-run", () => {
    const html = renderPanelControls(withChecks, { done: true, hasNext: true });
    expect(html).toContain('data-action="runChecks"');
    expect(html).toContain('data-action="next"');
  });

  it("shows Running Checks... and disables Run Checks while a run is in progress", () => {
    const html = renderPanelControls(withChecks, { done: false, hasNext: true, running: true });
    expect(html).toContain("Running Checks...");
    expect(html).toMatch(/<button[^>]*data-action="runChecks"[^>]*disabled/);
  });

  it("does not show Running Checks... or disable the button when idle", () => {
    const html = renderPanelControls(withChecks, { done: false, hasNext: true });
    expect(html).not.toContain("Running Checks...");
    expect(html).not.toMatch(/data-action="runChecks"[^>]*disabled/);
  });

  it("shows the local time the results ran, so a repeat failure is visibly a new run", () => {
    const html = renderPanelControls(withChecks, {
      done: false,
      hasNext: true,
      results: [{ check: "test_a.py", passed: false, output: "boom" }],
      ranAt: new Date(2026, 0, 2, 17, 42, 5),
    });
    expect(html).toContain("Ran at 17:42:05");
  });

  it("pads the time and shows no time before any run", () => {
    const early = renderPanelControls(withChecks, {
      done: false,
      hasNext: true,
      results: [],
      ranAt: new Date(2026, 0, 2, 7, 4, 9),
    });
    expect(early).toContain("Ran at 07:04:09");
    expect(renderPanelControls(withChecks, { done: false, hasNext: true })).not.toContain("Ran at");
  });

  it("shows the status message, such as how many documents were saved", () => {
    const html = renderPanelControls(withChecks, { done: false, hasNext: true, message: "Saved 2 files." });
    expect(html).toContain("Saved 2 files.");
  });
});

describe("read-only Provider Step panel", () => {
  it("says there is no key and offers no Run Checks", () => {
    const html = renderPanelControls(
      { ...step, checks: ["c.py"], provider: "openai" },
      { done: false, hasNext: true, noKeyProvider: "openai" },
    );
    expect(html).toContain("No key for openai. Read along, your Checks are skipped.");
    expect(html).not.toContain("runChecks");
    expect(html).toContain('data-action="next"');
  });
});
