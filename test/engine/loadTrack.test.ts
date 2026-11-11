import { describe, expect, it } from "vitest";
import * as path from "node:path";
import { loadTrack } from "../../src/engine";

const fixture = (name: string) => path.join(__dirname, "..", "fixtures", name);

describe("loadTrack", () => {
  it("loads a Track with its title, Habits and Lessons in order", async () => {
    const result = await loadTrack(fixture("valid-track"));
    if (!result.ok) throw new Error(JSON.stringify(result.errors));
    const { track } = result.session;
    expect(track.title).toBe("Fixture Track");
    expect(track.habits).toEqual(["Keep secrets in .env", "Small functions"]);
    expect(track.lessons.map((l) => l.title)).toEqual(["First Lesson", "Second Lesson"]);
  });

  it("loads each Lesson's Steps in order with explanation, Code Chunk and target file", async () => {
    const result = await loadTrack(fixture("valid-track"));
    if (!result.ok) throw new Error(JSON.stringify(result.errors));
    const lesson = result.session.track.lessons[0]!;
    expect(lesson.steps.map((s) => s.title)).toEqual(["Say hello", "Read a key"]);
    const step = lesson.steps[0]!;
    expect(step.explanation).toBe("Print a greeting so you know the project runs.");
    expect(step.codeChunk).toEqual({ language: "python", targetFile: "app/main.py", code: 'print("hello")' });
  });

  it("reserves the optional Provider tag and Checks on a Step", async () => {
    const result = await loadTrack(fixture("valid-track"));
    if (!result.ok) throw new Error(JSON.stringify(result.errors));
    const [plain, tagged] = result.session.track.lessons[0]!.steps;
    expect(plain!.provider).toBeUndefined();
    expect(plain!.checks).toEqual([]);
    expect(tagged!.provider).toBe("claude");
    expect(tagged!.checks).toEqual(["test_key.py"]);
    expect(tagged!.explanation).toBe("Keep secrets in `.env`, never in code.");
  });

  it("reads the Habit a Step calls out, which must be one of the Track's Habits", async () => {
    const result = await loadTrack(fixture("valid-track"));
    if (!result.ok) throw new Error(JSON.stringify(result.errors));
    const [plain, tagged] = result.session.track.lessons[0]!.steps;
    expect(plain!.habit).toBeUndefined();
    expect(tagged!.habit).toBe("Keep secrets in .env");
  });

  it("reports a Habit that the Track does not list, naming the file and line", async () => {
    const result = await loadTrack(fixture("bad-habit"));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.file).toBe("lessons/01.md");
    expect(result.errors[0]!.line).toBe(8);
    expect(result.errors[0]!.message).toMatch(/Keep secrets in \.env/);
    expect(result.errors[0]!.message).toMatch(/habits/);
  });

  it("keeps the Reflection questions at the end of a Lesson", async () => {
    const result = await loadTrack(fixture("valid-track"));
    if (!result.ok) throw new Error(JSON.stringify(result.errors));
    expect(result.session.track.lessons[0]!.reflection).toEqual(["Why keep the key out of the source file?"]);
  });

  it("looks up a Step by its id", async () => {
    const result = await loadTrack(fixture("valid-track"));
    if (!result.ok) throw new Error(JSON.stringify(result.errors));
    const { session } = result;
    const step = session.track.lessons[1]!.steps[0]!;
    expect(step.id).toBe("02-second/1");
    expect(session.getStep("02-second/1")).toBe(step);
    expect(session.getStep("nope")).toBeUndefined();
  });

  it("returns a validation error naming the file when the Track file is missing", async () => {
    const result = await loadTrack(fixture("does-not-exist"));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]!.file).toMatch(/track\.md$/);
  });

  it("returns a validation error naming the Lesson file when a listed Lesson is missing", async () => {
    const result = await loadTrack(fixture("missing-lesson-file"));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.file).toBe("lessons/nope.md");
    expect(result.errors[0]!.message).toMatch(/not found/i);
  });

  it("reports every malformed Step with its file and line", async () => {
    const result = await loadTrack(fixture("bad-step"));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.map((e) => [e.file, e.line])).toEqual([
      ["lessons/01.md", 4],
      ["lessons/01.md", 10],
    ]);
    expect(result.errors[0]!.message).toMatch(/Code Chunk/);
    expect(result.errors[1]!.message).toMatch(/file=/);
  });

  it("loads the sample Track shipped in examples", async () => {
    const result = await loadTrack(path.join(__dirname, "..", "..", "examples", "sample-track"));
    if (!result.ok) throw new Error(JSON.stringify(result.errors));
    expect(result.session.track.lessons.length).toBeGreaterThan(0);
  });
});
