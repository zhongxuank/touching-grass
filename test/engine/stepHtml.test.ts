import { describe, expect, it } from "vitest";
import {
  describeStarterOutcome,
  renderPanelControls,
  renderPanelDocument,
  renderReflectionDocument,
  renderReflectionHtml,
  renderStepHtml,
  renderTrackDocument,
  renderTrackHtml,
  renderCodeChunk,
  pageNav,
  pageTitle,
  type PageNav,
} from "../../src/stepHtml";
import * as path from "node:path";
import { loadTrack, type Lesson, type Step, type Track } from "../../src/engine";

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
    const html = renderPanelDocument(step, { done: false }, "abc123", "vscode-resource:");
    expect(html).toContain("default-src 'none'");
    expect(html).toContain("script-src 'nonce-abc123'");
    expect(html).toContain('<script nonce="abc123">');
  });

  it("lists each Check with its result and failure output, and lets the Learner open it", () => {
    const html = renderPanelControls(withChecks, {
      done: false,
      results: [
        { check: "test_a.py", passed: true, output: "" },
        { check: "test_b.py", passed: false, output: "assert <1> == 2" },
      ],
    });
    expect(html).toContain('data-action="runChecks"');
    expect(html).toContain('data-action="openCheck" data-check="test_b.py"');
    expect(html).toContain("assert &lt;1&gt; == 2");
  });

  it("offers Ask Claude on every Step, including read-only and keyless ones", () => {
    for (const state of [
      { done: false },
      { done: true },
      { done: false, noKeyProvider: "openai" },
    ]) {
      expect(renderPanelControls(withChecks, state)).toContain('data-action="askTutor"');
    }
  });

  it("shows a Run it button with the command when the Step has a run line, with or without Checks", () => {
    const runStep: Step = { ...step, run: "uv run python ask.py <x>" };
    for (const s of [runStep, { ...runStep, checks: ["test_a.py"] }]) {
      const html = renderPanelControls(s, { done: false });
      expect(html).toContain('data-action="runCommand"');
      expect(html).toContain("Run it: <code>uv run python ask.py &lt;x&gt;</code>");
    }
    expect(renderPanelControls(step, { done: false })).not.toContain("runCommand");
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
    const html = renderPanelControls(step, { done: false });
    expect(html).toContain('data-action="markDone"');
    expect(html).not.toContain("Run Checks");
  });

  it("keeps Run Checks on a done Step so its Checks can be re-run", () => {
    const html = renderPanelControls(withChecks, { done: true });
    expect(html).toContain('data-action="runChecks"');
    expect(html).not.toContain('data-action="next"');
  });

  it("shows Running Checks... and disables Run Checks while a run is in progress", () => {
    const html = renderPanelControls(withChecks, { done: false, running: true });
    expect(html).toContain("Running Checks...");
    expect(html).toMatch(/<button[^>]*data-action="runChecks"[^>]*disabled/);
  });

  it("does not show Running Checks... or disable the button when idle", () => {
    const html = renderPanelControls(withChecks, { done: false });
    expect(html).not.toContain("Running Checks...");
    expect(html).not.toMatch(/data-action="runChecks"[^>]*disabled/);
  });

  it("shows the local time the results ran, so a repeat failure is visibly a new run", () => {
    const html = renderPanelControls(withChecks, {
      done: false,
      results: [{ check: "test_a.py", passed: false, output: "boom" }],
      ranAt: new Date(2026, 0, 2, 17, 42, 5),
    });
    expect(html).toContain("Ran at 17:42:05");
  });

  it("pads the time and shows no time before any run", () => {
    const early = renderPanelControls(withChecks, {
      done: false,
      results: [],
      ranAt: new Date(2026, 0, 2, 7, 4, 9),
    });
    expect(early).toContain("Ran at 07:04:09");
    expect(renderPanelControls(withChecks, { done: false })).not.toContain("Ran at");
  });

  it("shows the status message, such as how many documents were saved", () => {
    const html = renderPanelControls(withChecks, { done: false, message: "Saved 2 files." });
    expect(html).toContain("Saved 2 files.");
  });
});

describe("read-only Provider Step panel", () => {
  it("says there is no key and offers no Run Checks", () => {
    const html = renderPanelControls(
      { ...step, checks: ["c.py"], provider: "openai" },
      { done: false, noKeyProvider: "openai" },
    );
    expect(html).toContain("No key for openai. Read along, your Checks are skipped.");
    expect(html).not.toContain("runChecks");
  });
});

describe("page header and footer", () => {
  const nav: PageNav = {
    lessonTitle: "Call <an> LLM",
    number: "1.5",
    done: 7,
    total: 18,
    previous: { label: "1.4 Read keys" },
    next: { label: "1.6 Call OpenAI", enabled: false, disabledReason: "Pass the Checks first." },
  };

  it("shows the Lesson name, the Step number, a progress bar and the done count in a header", () => {
    const html = renderPanelDocument(step, { done: false, nav }, "n", "csp:");
    expect(html).toContain("Call &lt;an&gt; LLM");
    expect(html).toContain("Step 1.5");
    expect(html).toContain("7 / 18 done");
    expect(html).toContain('role="progressbar"');
    expect(html).toContain('aria-valuenow="7"');
    expect(html).toContain("width:39%");
    expect(html.indexOf('class="page-bar"')).toBeLessThan(html.indexOf("Say &lt;hello&gt;"));
  });

  it("has Previous and Next buttons named after the pages, Next disabled with a tooltip until the Step is done", () => {
    const html = renderPanelDocument(step, { done: false, nav }, "n", "csp:");
    expect(html).toContain('data-action="previous"');
    expect(html).toContain("← 1.4 Read keys");
    expect(html).toMatch(/<button[^>]*data-action="next"[^>]*disabled[^>]*title="Pass the Checks first\."/);
    expect(html).toContain("1.6 Call OpenAI →");
    const open = renderPanelDocument(step, { done: true, nav: { ...nav, next: { label: "1.6 Call OpenAI", enabled: true } } }, "n", "csp:");
    expect(open).not.toMatch(/data-action="next"[^>]*disabled/);
  });

  it("leaves out Previous on the first page and Next on the last", () => {
    const html = renderPanelDocument(step, { done: true, nav: { ...nav, previous: undefined, next: undefined } }, "n", "csp:");
    expect(html).not.toContain('data-action="previous"');
    expect(html).not.toContain('data-action="next"');
  });

  it("adds no header or footer without navigation data, and keeps the strict CSP", () => {
    const html = renderPanelDocument(step, { done: false }, "n", "csp:");
    expect(html).not.toContain('class="page-bar"');
    expect(html).toContain("script-src 'nonce-n'");
  });

  it("uses VS Code's own button colours", () => {
    const html = renderPanelDocument(step, { done: false, nav }, "n", "csp:");
    for (const v of ["--vscode-button-background", "--vscode-button-foreground", "--vscode-button-secondaryBackground"]) {
      expect(html).toContain(v);
    }
  });

  it("gives the Reflection page the same header and footer", () => {
    const lesson: Lesson = { id: "l", title: "L", intro: "", steps: [step], reflection: ["Why?"] };
    const html = renderReflectionDocument(lesson, "n", "csp:", { ...nav, number: "Reflection" });
    expect(html).toContain('class="page-bar"');
    expect(html).toContain("7 / 18 done");
    expect(html).toContain('data-action="previous"');
    expect(html).not.toContain("Step Reflection");
    expect(html).toContain("Reflection");
  });
});

describe("pageNav and pageTitle from a session", () => {
  const load = async () => {
    const result = await loadTrack(path.join(__dirname, "..", "fixtures", "provider-track"), {
      readEnv: async () => ({}),
      processEnv: {},
    });
    if (!result.ok) throw new Error("fixture");
    return result.session;
  };

  it("names neighbours by number and title, and says why Next is disabled", async () => {
    const session = await load();
    const nav = pageNav(session, "01-call/1")!;
    expect(nav).toMatchObject({ lessonTitle: "Call an LLM", number: "1.1", done: 0, total: 6 });
    expect(nav.previous).toBeUndefined();
    expect(nav.next).toMatchObject({ label: "1.2 Call Claude", enabled: false });
    expect(nav.next?.disabledReason).toMatch(/Mark/);
    session.markDone("01-call/1");
    expect(pageNav(session, "01-call/1")!.next).toMatchObject({ enabled: true });
    expect(pageNav(session, "01-call/2")!.previous?.label).toBe("1.1 Set up");
  });

  it("links the last Step to the Reflection, and the Reflection to the next Lesson", async () => {
    const session = await load();
    expect(pageNav(session, "01-call/3")!.next?.label).toBe("Reflection");
    const nav = pageNav(session, "01-call/reflection")!;
    expect(nav).toMatchObject({ number: "Reflection", lessonTitle: "Call an LLM" });
    expect(nav.previous?.label).toBe("1.3 Call OpenAI");
    expect(nav.next).toMatchObject({ label: "2.1 Claude again", enabled: true });
  });

  it("titles panels with the number, and Reflection panels with their Lesson", async () => {
    const session = await load();
    expect(pageTitle(session, "01-call/3")).toBe("1.3 Call OpenAI");
    expect(pageTitle(session, "01-call/reflection")).toBe("Reflection: Call an LLM");
  });
});

describe("the builds-on notice", () => {
  it("offers Start from its finished code when the earlier Track is unfinished", () => {
    const html = renderPanelDocument(step, { done: false, buildsOn: { state: "unfinished", title: "Agents <1>" } }, "n", "csp:");
    expect(html).toContain("This Track continues Agents &lt;1&gt;. Finish it first, or start from its finished code.");
    expect(html).toContain('data-action="startFromEarlier"');
    expect(html).toContain("Start from its finished code");
  });

  it("says the earlier Track is missing, with no button", () => {
    const html = renderPanelDocument(step, { done: false, buildsOn: { state: "missing", title: "Gone" } }, "n", "csp:");
    expect(html).toContain("Gone");
    expect(html).toMatch(/not found/);
    expect(html).not.toContain('data-action="startFromEarlier"');
  });

  it("describes what the starter copied and what it skipped", () => {
    expect(describeStarterOutcome({ status: "copied", copied: ["a.py"], skipped: [] })).toBe("Copied 1 file into your workspace.");
    expect(describeStarterOutcome({ status: "copied", copied: ["a.py", "b.py"], skipped: ["c.py", "d/e.py"] })).toBe(
      "Copied 2 files into your workspace. Skipped 2 files that already exist: c.py, d/e.py.",
    );
  });

  it("shows nothing without a notice, and shows on the Track overview too", () => {
    expect(renderPanelDocument(step, { done: false }, "n", "csp:")).not.toContain("This Track continues");
    const track: Track = { title: "T", habits: [], lessons: [] };
    const html = renderTrackDocument(track, "n", "csp:", { state: "unfinished", title: "Earlier" });
    expect(html).toContain("This Track continues Earlier.");
  });
});
