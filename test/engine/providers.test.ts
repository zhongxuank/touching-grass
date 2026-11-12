import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import {
  formatValidationError,
  loadTrack,
  parseEnv,
  PROGRESS_DIR,
  PROGRESS_FILE,
  providersWithKeys,
  readEnvFile,
  type CheckRunRequest,
  type CheckRunner,
} from "../../src/engine";

const fixture = (name: string) => path.join(__dirname, "..", "fixtures", name);
const CLAUDE_1 = "01-call/2";
const OPENAI_1 = "01-call/3";
const PLAIN_1 = "01-call/1";
const CLAUDE_2 = "02-more/1";
const OPENAI_2 = "02-more/2";
const ANY_2 = "02-more/3";

function fakeRunner() {
  const requests: CheckRunRequest[] = [];
  const runner: CheckRunner = {
    async run(request) {
      requests.push(request);
      return { ok: true, results: request.checks.map((c) => ({ check: c.name, passed: true, output: "ok" })) };
    },
  };
  return { runner, requests };
}

/** Load the Provider fixture with a fake `.env` (a mutable object) and a fake process environment. */
async function load(dotEnv: Record<string, string>, processEnv: NodeJS.ProcessEnv = {}) {
  const { runner, requests } = fakeRunner();
  const result = await loadTrack(fixture("provider-track"), {
    checkRunner: runner,
    readEnv: async () => dotEnv,
    processEnv,
  });
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  sessions.push(result.session);
  return { session: result.session, requests };
}

const sessions: { flush(): Promise<unknown> }[] = [];
let workspace: string;
beforeEach(async () => {
  sessions.length = 0;
  workspace = await fs.mkdtemp(path.join(os.tmpdir(), "tg-providers-"));
});
afterEach(async () => {
  await Promise.all(sessions.map((s) => s.flush()));
  await fs.rm(workspace, { recursive: true, force: true });
});

describe("detecting Provider keys", () => {
  it("parses .env text: export, quotes and comments", () => {
    expect(parseEnv('# c\nA=1\nexport B="two words"\nC=\'x\'\nD=val # note\nnot a line')).toEqual({
      A: "1",
      B: "two words",
      C: "x",
      D: "val",
    });
  });

  it("reads the workspace .env from disk, and treats a missing file as empty", async () => {
    expect(await readEnvFile(workspace)).toEqual({});
    await fs.writeFile(path.join(workspace, ".env"), "OPENAI_API_KEY=sk-1\n");
    expect(await readEnvFile(workspace)).toEqual({ OPENAI_API_KEY: "sk-1" });
  });

  it("finds Providers with a non-empty key in .env, falling back to the process environment", () => {
    expect(providersWithKeys({ ANTHROPIC_API_KEY: "a", OPENAI_API_KEY: "  " }, { OPENROUTER_API_KEY: "r" })).toEqual([
      "claude",
      "openrouter",
    ]);
    expect(providersWithKeys({}, { OPENAI_API_KEY: "" })).toEqual([]);
  });

  it("re-detects when Checks are run, so a key added later works without a reload", async () => {
    const dotEnv: Record<string, string> = {};
    const { session, requests } = await load(dotEnv);
    await session.openWorkspace(workspace);
    expect(session.getAvailableProviders()).toEqual([]);
    dotEnv.ANTHROPIC_API_KEY = "sk-secret";
    const outcome = await session.runChecks(CLAUDE_1);
    expect(outcome.status).toBe("ran");
    expect(session.getAvailableProviders()).toEqual(["claude"]);
    expect(JSON.stringify(outcome)).not.toContain("sk-secret");
    // the .env values reach the Check runner's environment
    expect(requests[0]!.env).toEqual({ ANTHROPIC_API_KEY: "sk-secret" });
  });
});

describe("Provider Steps without a key", () => {
  it("skips the Checks and counts the Step as done by skip", async () => {
    const { session, requests } = await load({ ANTHROPIC_API_KEY: "k" });
    await session.openWorkspace(workspace);
    expect(session.missingProvider(OPENAI_1)).toBe("openai");
    expect(session.missingProvider(CLAUDE_1)).toBeUndefined();
    expect(await session.runChecks(OPENAI_1)).toEqual({ status: "skipped", provider: "openai" });
    expect(requests).toEqual([]);
    expect(session.isDone(OPENAI_1)).toBe(true);
    expect(session.isSkipped(OPENAI_1)).toBe(true);
    await session.flush();
    const saved = JSON.parse(await fs.readFile(path.join(workspace, PROGRESS_DIR, PROGRESS_FILE), "utf8")).tracks["Provider Track"];
    expect(saved.skippedSteps).toEqual([OPENAI_1]);
    expect(saved.doneSteps).toContain(OPENAI_1);
  });

  it("lets the Learner advance past it without running Checks, so one key finishes the Lesson", async () => {
    const { session } = await load({ ANTHROPIC_API_KEY: "k" });
    await session.openWorkspace(workspace);
    expect(session.advance(CLAUDE_1)).toBeUndefined(); // not done, has a key
    await session.runChecks(CLAUDE_1);
    expect(session.advance(CLAUDE_1)?.id).toBe(OPENAI_1);
    session.chooseProvider("claude");
    expect(session.advance(OPENAI_1)?.id).toBe(CLAUDE_2);
    expect(session.isSkipped(OPENAI_1)).toBe(true);
  });

  it("restores the skip, and a later key lets the Checks run and clears the skip", async () => {
    const dotEnv: Record<string, string> = { ANTHROPIC_API_KEY: "k" };
    const first = await load(dotEnv);
    await first.session.openWorkspace(workspace);
    await first.session.runChecks(OPENAI_1);
    await first.session.flush();

    const second = await load(dotEnv);
    await second.session.openWorkspace(workspace);
    expect(second.session.isSkipped(OPENAI_1)).toBe(true);
    dotEnv.OPENAI_API_KEY = "o";
    expect((await second.session.runChecks(OPENAI_1)).status).toBe("ran");
    expect(second.session.isSkipped(OPENAI_1)).toBe(false);
    expect(second.session.isDone(OPENAI_1)).toBe(true);
  });
});

describe("choosing a Provider", () => {
  async function throughLessonOne(dotEnv: Record<string, string>) {
    const loaded = await load(dotEnv);
    await loaded.session.openWorkspace(workspace);
    loaded.session.markDone(PLAIN_1);
    await loaded.session.runChecks(CLAUDE_1);
    await loaded.session.runChecks(OPENAI_1);
    return loaded.session;
  }

  it("reports a choice is needed when advancing out of the first Provider Lesson, not before", async () => {
    const session = await throughLessonOne({ ANTHROPIC_API_KEY: "a", OPENAI_API_KEY: "o" });
    expect(session.advance(PLAIN_1)?.id).toBe(CLAUDE_1);
    expect(session.providerChoiceNeeded()).toBe(false);
    expect(session.advance(OPENAI_1)).toBeUndefined();
    expect(session.providerChoiceNeeded()).toBe(true);
    expect(session.getAvailableProviders()).toEqual(["claude", "openai"]);
  });

  it("returns the held Step once chosen, and refuses unknown or keyless Providers", async () => {
    const session = await throughLessonOne({ ANTHROPIC_API_KEY: "a", OPENAI_API_KEY: "o" });
    session.advance(OPENAI_1);
    expect(session.chooseProvider("gemini")).toBeUndefined();
    expect(session.chooseProvider("openrouter")).toBeUndefined();
    expect(session.getChosenProvider()).toBeUndefined();
    expect(session.chooseProvider("openai")?.id).toBe("02-more/2");
    expect(session.providerChoiceNeeded()).toBe(false);
    expect(session.getChosenProvider()).toBe("openai");
  });

  it("hides other Providers' Steps in later Lessons, keeps Lesson 1 and Steps with no Provider", async () => {
    const session = await throughLessonOne({ ANTHROPIC_API_KEY: "a", OPENAI_API_KEY: "o" });
    expect(session.getVisibleSteps().length).toBe(6);
    session.advance(OPENAI_1);
    session.chooseProvider("openai");
    expect(session.getVisibleSteps().map((s) => s.id)).toEqual([PLAIN_1, CLAUDE_1, OPENAI_1, OPENAI_2, ANY_2]);
    expect(session.isVisible(CLAUDE_2)).toBe(false);
    expect(session.isVisible(CLAUDE_1)).toBe(true);
  });

  it("saves the choice in the progress file and restores it", async () => {
    const dotEnv = { ANTHROPIC_API_KEY: "a", OPENAI_API_KEY: "o" };
    const session = await throughLessonOne(dotEnv);
    session.advance(OPENAI_1);
    session.chooseProvider("claude");
    await session.flush();
    const saved = JSON.parse(await fs.readFile(path.join(workspace, PROGRESS_DIR, PROGRESS_FILE), "utf8")).tracks["Provider Track"];
    expect(saved.chosenProvider).toBe("claude");

    const again = await load(dotEnv);
    await again.session.openWorkspace(workspace);
    expect(again.session.getChosenProvider()).toBe("claude");
    expect(again.session.isVisible(OPENAI_2)).toBe(false);
    // no choice is asked for again
    expect(again.session.advance(OPENAI_1)?.id).toBe(CLAUDE_2);
  });

  it("loads a progress file written before Providers existed", async () => {
    await fs.mkdir(path.join(workspace, PROGRESS_DIR));
    await fs.writeFile(
      path.join(workspace, PROGRESS_DIR, PROGRESS_FILE),
      JSON.stringify({ version: 1, trackTitle: "Provider Track", doneSteps: [PLAIN_1], currentStep: CLAUDE_1 }),
    );
    const { session } = await load({ ANTHROPIC_API_KEY: "a" });
    expect(await session.openWorkspace(workspace)).toEqual({});
    expect(session.isDone(PLAIN_1)).toBe(true);
    expect(session.getChosenProvider()).toBeUndefined();
  });

  it("asks for no choice when no Provider has a key", async () => {
    const { session } = await load({});
    await session.openWorkspace(workspace);
    session.markDone(PLAIN_1);
    await session.runChecks(CLAUDE_1);
    await session.runChecks(OPENAI_1);
    expect(session.advance(OPENAI_1)?.id).toBe(CLAUDE_2);
    expect(session.providerChoiceNeeded()).toBe(false);
  });
});

describe("validating Providers", () => {
  it("rejects an unknown Provider name with the file and line", async () => {
    const result = await loadTrack(fixture("bad-provider"));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.map((e) => [e.file, e.line])).toEqual([["lessons/01.md", 6]]);
    expect(formatValidationError(result.errors[0]!)).toMatch(/unknown Provider "gemini".*claude, openai, openrouter/);
  });
});
