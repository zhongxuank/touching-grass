import { describe, expect, it } from "vitest";
import * as path from "node:path";
import { formatValidationError, loadTrack } from "../../src/engine";
import { parseLessonFile } from "../../src/engine/parse";

const fixture = (name: string) => path.join(__dirname, "..", "fixtures", name);

describe("loadTrack validation", () => {
  it("reports a Lesson file listed twice in track.md, on the second listing", async () => {
    const result = await loadTrack(fixture("duplicate-lesson"));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.map((e) => [e.file, e.line])).toEqual([["track.md", 5]]);
    expect(result.errors[0]!.message).toMatch(/lessons\/01-hello\.md/);
    expect(result.errors[0]!.message).toMatch(/listed twice/);
    expect(result.errors[0]!.message).toMatch(/remove this line/i);
  });

  it("reports two Lesson files whose ids (file name without extension) collide", async () => {
    const result = await loadTrack(fixture("id-collision"));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.map((e) => [e.file, e.line])).toEqual([["track.md", 5]]);
    expect(result.errors[0]!.message).toMatch(/"01"/);
    expect(result.errors[0]!.message).toMatch(/lessons\/part-a\/01\.md/);
    expect(result.errors[0]!.message).toMatch(/lessons\/part-b\/01\.md/);
    expect(result.errors[0]!.message).toMatch(/rename/i);
  });

  it("reports a Step whose checks file is missing from the Track's checks/ folder, on the checks line", async () => {
    const result = await loadTrack(fixture("missing-check-file"));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.map((e) => [e.file, e.line])).toEqual([["lessons/01-keys.md", 7]]);
    expect(result.errors[0]!.message).toMatch(/test_missing\.py/);
    expect(result.errors[0]!.message).toMatch(/checks\//);
    expect(result.errors[0]!.message).not.toMatch(/test_present/);
  });

  it("reports a Code Chunk with an empty body, whether it has no lines or only blank ones", async () => {
    const result = await loadTrack(fixture("empty-code-chunk"));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.map((e) => [e.file, e.line])).toEqual([
      ["lessons/01-empty.md", 8],
      ["lessons/01-empty.md", 15],
    ]);
    expect(result.errors[0]!.message).toMatch(/No code at all/);
    expect(result.errors[0]!.message).toMatch(/Code Chunk is empty/);
    expect(result.errors[1]!.message).toMatch(/Only blank lines/);
  });

  it("names the file and line in the printed form of each error", async () => {
    const result = await loadTrack(fixture("duplicate-lesson"));
    if (result.ok) throw new Error("expected errors");
    expect(formatValidationError(result.errors[0]!)).toMatch(/^track\.md:5: /);
  });
});

describe("new and edited files", () => {
  const lesson = (steps: string) => `---\ntitle: L\n---\n${steps}`;
  const stepMd = (title: string, file: string, meta = "") =>
    `\n## Step: ${title}\n\n${meta}${meta ? "\n\n" : ""}Explain.\n\n\`\`\`python file=${file}\nx = 1\n\`\`\`\n`;

  it("marks the first Step for a file as new, with its folder when that is new too", () => {
    const seenFiles = new Set<string>();
    const first = parseLessonFile("a.md", "a", lesson(stepMd("One", "app/a.py") + stepMd("Two", "app/b.py")), { seenFiles });
    const [one, two] = first.value!.steps;
    expect(one!.codeChunk).toMatchObject({ newFile: true, newFolder: "app" });
    expect(two!.codeChunk.newFile).toBe(true);
    expect(two!.codeChunk.newFolder).toBeUndefined();
  });

  it("carries files across Lessons, and reads an edit's place line", () => {
    const seenFiles = new Set<string>();
    parseLessonFile("a.md", "a", lesson(stepMd("One", "app/a.py")), { seenFiles });
    const second = parseLessonFile("b.md", "b", lesson(stepMd("Two", "./app/a.py", "place: Replace the whole file")), {
      seenFiles,
    });
    expect(second.value!.steps[0]!.codeChunk).toMatchObject({ newFile: false, place: "Replace the whole file" });
  });

  it("reports an edit with no place line, on the fence", () => {
    const text = lesson(stepMd("One", "app/a.py") + stepMd("Two", "app/a.py"));
    const result = parseLessonFile("a.md", "a", text);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.message).toMatch(/already creates app\/a\.py.*place:/);
    expect(text.split("\n")[result.errors[0]!.line! - 1]).toMatch(/^```python file=app\/a\.py/);
  });
});
