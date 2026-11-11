import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  CLAUDE_MD,
  CURRENT_STEP_FILE,
  PROGRESS_DIR,
  renderCurrentStep,
  renderTutorGuide,
  TUTOR_GUIDE_FILE,
  TUTOR_IMPORT_LINE,
  withTutorImport,
  writeCurrentStep,
  writeTutorGuide,
  type Step,
} from "../../src/engine";

const step: Step = {
  id: "01-call-an-llm/5",
  title: "Call Claude",
  explanation: "Send one message and print the reply.",
  codeChunk: { language: "python", targetFile: "app/claude.py", code: "print('hi')\n", newFile: true },
  provider: "claude",
  checks: ["test_claude.py"],
  habit: "Type hints",
};
const info = { trackTitle: "Build an agent", trackFolder: "/tracks/build-an-agent" };

describe("renderTutorGuide", () => {
  it("names the Track, its folder and the current Step file, and forbids writing the Code Chunk", () => {
    const guide = renderTutorGuide(info);
    expect(guide).toContain('"Build an agent"');
    expect(guide).toContain("/tracks/build-an-agent");
    expect(guide).toContain(`${PROGRESS_DIR}/${CURRENT_STEP_FILE}`);
    expect(guide).toContain("Do not write, edit or paste the Code Chunk");
    expect(guide).toContain("Never print the values in `.env`");
  });
});

describe("renderCurrentStep", () => {
  it("lists the Step's details, explanation and Code Chunk", () => {
    const text = renderCurrentStep(step);
    expect(text).toContain("# Current Step: Call Claude");
    expect(text).toContain("New file: `app/claude.py`");
    expect(text).toContain("Provider: claude");
    expect(text).toContain("Habit: Type hints");
    expect(text).toContain("```python\nprint('hi')\n```");
    expect(text).not.toContain("Last Check results");
  });

  it("adds failed Check output, but not output of passed Checks", () => {
    const text = renderCurrentStep({ ...step, checks: ["a.py", "b.py"] }, [
      { check: "a.py", passed: true, output: "all good" },
      { check: "b.py", passed: false, output: "AssertionError: boom" },
    ]);
    expect(text).toContain("`a.py`: passed");
    expect(text).toContain("`b.py`: failed");
    expect(text).toContain("AssertionError: boom");
    expect(text).not.toContain("all good");
  });

  it("uses a longer fence when the Code Chunk contains a fence", () => {
    const text = renderCurrentStep({ ...step, codeChunk: { ...step.codeChunk, code: 'x = """\n```\n"""' } });
    expect(text).toContain("````python\n");
  });
});

describe("withTutorImport", () => {
  it("creates a CLAUDE.md that imports the guide", () => {
    expect(withTutorImport(undefined)).toContain(`\n${TUTOR_IMPORT_LINE}\n`);
  });
  it("appends the import to the Learner's own CLAUDE.md and keeps their content", () => {
    expect(withTutorImport("# Mine\nUse ruff.")).toBe(`# Mine\nUse ruff.\n\n${TUTOR_IMPORT_LINE}\n`);
  });
  it("leaves a CLAUDE.md that already imports the guide alone", () => {
    expect(withTutorImport(`# Mine\n${TUTOR_IMPORT_LINE}\n`)).toBeUndefined();
  });
});

describe("writing Tutor files", () => {
  let workspace: string;
  beforeEach(async () => {
    workspace = await fs.mkdtemp(path.join(os.tmpdir(), "tg-tutor-"));
  });
  afterEach(async () => {
    await fs.rm(workspace, { recursive: true, force: true });
  });

  it("writes the guide and a CLAUDE.md, and adds the import only once", async () => {
    expect(await writeTutorGuide(workspace, info)).toBeUndefined();
    expect(await writeTutorGuide(workspace, info)).toBeUndefined();
    const guide = await fs.readFile(path.join(workspace, PROGRESS_DIR, TUTOR_GUIDE_FILE), "utf8");
    expect(guide).toContain("Build an agent");
    const claudeMd = await fs.readFile(path.join(workspace, CLAUDE_MD), "utf8");
    expect(claudeMd.split(TUTOR_IMPORT_LINE).length - 1).toBe(1);
  });

  it("keeps an existing CLAUDE.md's content", async () => {
    await fs.writeFile(path.join(workspace, CLAUDE_MD), "# Mine\n");
    await writeTutorGuide(workspace, info);
    const claudeMd = await fs.readFile(path.join(workspace, CLAUDE_MD), "utf8");
    expect(claudeMd.startsWith("# Mine\n")).toBe(true);
    expect(claudeMd).toContain(TUTOR_IMPORT_LINE);
  });

  it("writes the current Step", async () => {
    expect(await writeCurrentStep(workspace, step)).toBeUndefined();
    const text = await fs.readFile(path.join(workspace, PROGRESS_DIR, CURRENT_STEP_FILE), "utf8");
    expect(text).toContain("Call Claude");
  });

  it("reports a failure instead of throwing", async () => {
    const file = path.join(workspace, "not-a-folder");
    await fs.writeFile(file, "");
    expect(await writeCurrentStep(file, step)).toMatch(/Could not write/);
  });
});
