import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { loadTrack, type CheckRunner } from "../../src/engine";

const fixture = (name: string) => path.join(__dirname, "..", "fixtures", name);
const runner: CheckRunner = {
  async run(request) {
    return { ok: true, results: request.checks.map((c) => ({ check: c.name, passed: true, output: "ok" })) };
  },
};

const PLAIN_1 = "01-call/1";
const CLAUDE_1 = "01-call/2";
const OPENAI_1 = "01-call/3";
const REFLECTION_1 = "01-call/reflection";
const CLAUDE_2 = "02-more/1";
const OPENAI_2 = "02-more/2";
const ANY_2 = "02-more/3";

let workspace: string;
const sessions: { flush(): Promise<unknown> }[] = [];
beforeEach(async () => {
  workspace = await fs.mkdtemp(path.join(os.tmpdir(), "tg-pages-"));
});
afterEach(async () => {
  await Promise.all(sessions.map((s) => s.flush()));
  sessions.length = 0;
  await fs.rm(workspace, { recursive: true, force: true });
});

async function load(dotEnv: Record<string, string> = { ANTHROPIC_API_KEY: "a", OPENAI_API_KEY: "o" }) {
  const result = await loadTrack(fixture("provider-track"), {
    checkRunner: runner,
    readEnv: async () => dotEnv,
    processEnv: {},
  });
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  sessions.push(result.session);
  await result.session.openWorkspace(workspace);
  return result.session;
}

/** Finish Lesson 1's Steps so the Learner is on its Reflection. */
async function throughLessonOne(session: Awaited<ReturnType<typeof load>>) {
  session.markDone(PLAIN_1);
  await session.runChecks(CLAUDE_1);
  await session.runChecks(OPENAI_1);
}

describe("the page sequence", () => {
  it("lists Steps and a Reflection after each Lesson's last Step, with stable ids", async () => {
    const session = await load();
    expect(session.getPages().map((p) => session.pageId(p))).toEqual([
      PLAIN_1, CLAUDE_1, OPENAI_1, REFLECTION_1, CLAUDE_2, OPENAI_2, ANY_2,
    ]);
  });

  it("has no Reflection page for a Lesson without Reflection questions", async () => {
    const session = await load();
    const lessons = session.getPages().flatMap((p) => (p.kind === "reflection" ? [p.lesson.id] : []));
    expect(lessons).toEqual(["01-call"]);
  });

  it("leaves hidden Provider Steps out once a Provider is chosen", async () => {
    const session = await load();
    await throughLessonOne(session);
    session.nextPage(REFLECTION_1);
    session.chooseProvider("openai");
    expect(session.getPages().map((p) => session.pageId(p))).toEqual([
      PLAIN_1, CLAUDE_1, OPENAI_1, REFLECTION_1, OPENAI_2, ANY_2,
    ]);
  });

  it("numbers Steps <lesson>.<step> among the visible Steps, and Reflections as Reflection", async () => {
    const session = await load();
    expect(session.pageNumber(PLAIN_1)).toBe("1.1");
    expect(session.pageNumber(OPENAI_1)).toBe("1.3");
    expect(session.pageNumber(REFLECTION_1)).toBe("Reflection");
    expect(session.pageNumber(ANY_2)).toBe("2.3");
    await throughLessonOne(session);
    session.nextPage(REFLECTION_1);
    session.chooseProvider("openai");
    expect(session.pageNumber(OPENAI_2)).toBe("2.1");
    expect(session.pageNumber(ANY_2)).toBe("2.2");
    expect(session.pageNumber(CLAUDE_2)).toBeUndefined();
  });
});

describe("previous and next page", () => {
  it("always allows previous, and has none before the first page", async () => {
    const session = await load();
    expect(session.previousPage(PLAIN_1)).toBeUndefined();
    expect(session.pageId(session.previousPage(CLAUDE_1)!)).toBe(PLAIN_1);
    expect(session.pageId(session.previousPage(REFLECTION_1)!)).toBe(OPENAI_1);
    expect(session.pageId(session.previousPage(CLAUDE_2)!)).toBe(REFLECTION_1);
  });

  it("allows next from a Step only once it is done", async () => {
    const session = await load();
    expect(session.nextPage(PLAIN_1)).toBeUndefined();
    expect(session.canGoNext(PLAIN_1)).toBe(false);
    session.markDone(PLAIN_1);
    expect(session.canGoNext(PLAIN_1)).toBe(true);
    expect(session.pageId(session.nextPage(PLAIN_1)!)).toBe(CLAUDE_1);
  });

  it("goes from the last Step to the Reflection", async () => {
    const session = await load();
    await throughLessonOne(session);
    expect(session.nextPage(OPENAI_1)?.kind).toBe("reflection");
    expect(session.providerChoiceNeeded()).toBe(false);
  });

  it("holds the Provider choice when leaving the first Provider Lesson, and releases it on choosing", async () => {
    const session = await load();
    await throughLessonOne(session);
    expect(session.canGoNext(REFLECTION_1)).toBe(true);
    expect(session.nextPage(REFLECTION_1)).toBeUndefined();
    expect(session.providerChoiceNeeded()).toBe(true);
    expect(session.chooseProvider("claude")?.id).toBe(CLAUDE_2);
    expect(session.providerChoiceNeeded()).toBe(false);
  });

  it("goes from the Reflection straight to the next Lesson when no Provider has a key", async () => {
    const session = await load({});
    await throughLessonOne(session);
    expect(session.pageId(session.nextPage(OPENAI_1)!)).toBe(REFLECTION_1);
    expect(session.pageId(session.nextPage(REFLECTION_1)!)).toBe(CLAUDE_2);
    expect(session.providerChoiceNeeded()).toBe(false);
  });

  it("lets a Provider Step with no key be passed, counting it as skipped", async () => {
    const session = await load({ ANTHROPIC_API_KEY: "a" });
    session.markDone(PLAIN_1);
    await session.runChecks(CLAUDE_1);
    expect(session.canGoNext(OPENAI_1)).toBe(true);
    expect(session.pageId(session.nextPage(OPENAI_1)!)).toBe(REFLECTION_1);
    expect(session.isSkipped(OPENAI_1)).toBe(true);
  });

  it("has no next page after the last one, or for an unknown id", async () => {
    const session = await load({});
    session.markDone(ANY_2);
    expect(session.nextPage(ANY_2)).toBeUndefined();
    expect(session.hasNextPage(ANY_2)).toBe(false);
    expect(session.hasNextPage(PLAIN_1)).toBe(true);
    expect(session.nextPage("nope/1")).toBeUndefined();
    expect(session.previousPage("nope/1")).toBeUndefined();
  });
});

describe("progress counts", () => {
  it("counts done visible Steps overall and per Lesson", async () => {
    const session = await load();
    expect(session.progressCount()).toEqual({ done: 0, total: 6 });
    session.markDone(PLAIN_1);
    await session.runChecks(CLAUDE_1);
    expect(session.progressCount()).toEqual({ done: 2, total: 6 });
    expect(session.progressCount("01-call")).toEqual({ done: 2, total: 3 });
    expect(session.progressCount("02-more")).toEqual({ done: 0, total: 3 });
  });
});
