import { describe, expect, it } from "vitest";
import * as path from "node:path";
import { formatValidationError, loadTrack } from "../../src/engine";

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
