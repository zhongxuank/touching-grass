import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { loadTrack, renderCurrentStep } from "../../src/engine";
import { parseLessonFile } from "../../src/engine/parse";
import { describeCopyOutcome, renderStepHtml } from "../../src/stepHtml";

const fixture = path.join(__dirname, "..", "fixtures", "copy-track");

const lesson = (meta: string) =>
  `---\ntitle: L\n---\n\n## Step: Get files\n\n${meta}\n\nExplain.\n\n\`\`\`python file=a.py\nx = 1\n\`\`\`\n`;

describe("copy line", () => {
  it("reads a Track folder and a workspace folder into Step.copy", () => {
    const result = parseLessonFile("a.md", "a", lesson("copy: assets/pdfs -> sources"));
    expect(result.value!.steps[0]!.copy).toEqual({ from: "assets/pdfs", to: "sources" });
  });

  it("tidies slashes and leaves Step.copy unset without the line", () => {
    const tidy = parseLessonFile("a.md", "a", lesson("copy: ./assets/pdfs/ -> sources/notes/"));
    expect(tidy.value!.steps[0]!.copy).toEqual({ from: "assets/pdfs", to: "sources/notes" });
    expect(parseLessonFile("a.md", "a", lesson("")).value!.steps[0]!.copy).toBeUndefined();
  });

  it.each([
    ["no arrow", "copy: assets/pdfs", /written like/],
    ["an empty source", "copy: -> sources", /Track folder is empty/],
    ["an empty target", "copy: assets/pdfs ->", /workspace folder is empty/],
    ["an absolute target", "copy: assets/pdfs -> /etc", /relative/],
    ["a target that leaves the workspace", "copy: assets/pdfs -> ../out", /must not contain/],
    ["a source that leaves the Track", "copy: ../secrets -> sources", /must not contain/],
  ])("reports %s, on the copy line", (_name, meta, message) => {
    const text = lesson(meta);
    const result = parseLessonFile("a.md", "a", text);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.message).toMatch(message);
    expect(text.split("\n")[result.errors[0]!.line! - 1]).toBe(meta);
  });

  it("reports a source folder that is not in the Track", () => {
    const result = parseLessonFile("a.md", "a", lesson("copy: assets/pdfs -> sources"), { folderExists: () => false });
    expect(result.errors[0]!.message).toMatch(/"assets\/pdfs".*does not exist/);
  });

  it("checks the source folder against the real Track folder when loading", async () => {
    const ok = await loadTrack(fixture);
    expect(ok.ok).toBe(true);
    const text = await fs.readFile(path.join(fixture, "lessons", "01-copy.md"), "utf8");
    const parsed = parseLessonFile("lessons/01-copy.md", "01-copy", text.replace("assets/pdfs", "assets/missing"), {
      folderExists: (rel) => rel === "assets/pdfs",
    });
    expect(parsed.errors[0]!.message).toMatch(/assets\/missing/);
  });
});

describe("copy in the panel and for the Tutor", () => {
  const step = {
    id: "l/1",
    title: "Get files",
    explanation: "Explain.",
    codeChunk: { language: "python", targetFile: "a.py", code: "x = 1", newFile: true },
    checks: [],
    copy: { from: "assets/pdfs", to: "sources" },
  };

  it("shows a Copy the files button that says what is copied and where", () => {
    const html = renderStepHtml(step);
    expect(html).toContain('data-action="copyFiles"');
    expect(html).toContain("<code>assets/pdfs</code>");
    expect(html).toContain("<code>sources</code>");
    const { copy: _copy, ...plain } = step;
    expect(renderStepHtml(plain)).not.toContain("copyFiles");
  });

  it("lists the copy for the Tutor", () => {
    expect(renderCurrentStep(step)).toContain("- Copy:");
    expect(renderCurrentStep(step)).toContain("`assets/pdfs`");
  });

  it("reports how many files were copied and how many were already there", () => {
    expect(describeCopyOutcome({ status: "copied", to: "sources", copied: ["a"], skipped: ["b", "c"] })).toContain(
      "1 copied, 2 already there",
    );
  });
});

describe("copyStepFiles", () => {
  let workspace: string;
  beforeEach(async () => {
    workspace = await fs.mkdtemp(path.join(os.tmpdir(), "tg-copy-"));
  });
  afterEach(async () => {
    await fs.rm(workspace, { recursive: true, force: true });
  });

  async function open() {
    const result = await loadTrack(fixture, { processEnv: {}, readEnv: async () => ({}) });
    if (!result.ok) throw new Error(JSON.stringify(result.errors));
    return result.session;
  }

  it("needs a workspace", async () => {
    expect(await (await open()).copyStepFiles("01-copy/1")).toEqual({ status: "no-workspace" });
  });

  it("copies every file, nested folders included, creating the target folder", async () => {
    const session = await open();
    session.setWorkspace(workspace);
    const outcome = await session.copyStepFiles("01-copy/1");
    expect(outcome).toEqual({ status: "copied", to: "sources", copied: ["a.txt", "sub/b.txt"], skipped: [] });
    expect(await fs.readFile(path.join(workspace, "sources", "sub", "b.txt"), "utf8")).toBe("two\n");
  });

  it("never overwrites a file that is already there, and reports it", async () => {
    const session = await open();
    session.setWorkspace(workspace);
    await fs.mkdir(path.join(workspace, "sources"));
    await fs.writeFile(path.join(workspace, "sources", "a.txt"), "mine\n");
    const outcome = await session.copyStepFiles("01-copy/1");
    expect(outcome).toMatchObject({ status: "copied", copied: ["sub/b.txt"], skipped: ["a.txt"] });
    expect(await fs.readFile(path.join(workspace, "sources", "a.txt"), "utf8")).toBe("mine\n");
    const again = await session.copyStepFiles("01-copy/1");
    expect(again).toMatchObject({ copied: [], skipped: ["a.txt", "sub/b.txt"] });
  });

  it("is an error to name a Track folder that does not exist, when loading the Track", async () => {
    const copy = await fs.mkdtemp(path.join(os.tmpdir(), "tg-copy-track-"));
    try {
      await fs.cp(fixture, copy, { recursive: true });
      await fs.rm(path.join(copy, "assets"), { recursive: true });
      const result = await loadTrack(copy);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors[0]).toMatchObject({ file: "lessons/01-copy.md", line: 8 });
    } finally {
      await fs.rm(copy, { recursive: true, force: true });
    }
  });
});
