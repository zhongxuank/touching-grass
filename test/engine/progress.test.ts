import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { loadTrack, PROGRESS_DIR, PROGRESS_FILE, type ProgressStore } from "../../src/engine";

const fixture = (name: string) => path.join(__dirname, "..", "fixtures", name);
const NO_CHECKS = "01-first/1";
const WITH_CHECKS = "01-first/2";
const SECOND_LESSON = "02-second/1";

async function load() {
  const result = await loadTrack(fixture("valid-track"), {
    checkRunner: { run: async () => ({ ok: true, results: [] }) },
    processEnv: { ANTHROPIC_API_KEY: "test" },
  });
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return result.session;
}

/** An in-memory ProgressStore, for cases where the file content must be set up by hand. */
function memoryStore(initial?: string) {
  let text = initial;
  const backups: string[] = [];
  const store: ProgressStore = {
    async read() {
      return text;
    },
    async write(t) {
      text = t;
    },
    async setAside() {
      if (text === undefined) throw new Error("nothing to copy");
      backups.push(text);
    },
  };
  return { store, backups };
}

let workspace: string;
let progressPath: string;

beforeEach(async () => {
  workspace = await fs.mkdtemp(path.join(os.tmpdir(), "tg-progress-"));
  progressPath = path.join(workspace, PROGRESS_DIR, PROGRESS_FILE);
});

afterEach(async () => {
  await fs.rm(workspace, { recursive: true, force: true });
});

describe("saving and loading progress", () => {
  it("saves done Steps and the current Step to the workspace, and loads them back", async () => {
    const first = await load();
    await first.openWorkspace(workspace);
    first.markDone(NO_CHECKS);
    first.openStep(WITH_CHECKS);
    expect(await first.flush()).toBeUndefined();

    const saved = JSON.parse(await fs.readFile(progressPath, "utf8"));
    expect(saved).toEqual({
      version: 1,
      trackTitle: "Fixture Track",
      doneSteps: [NO_CHECKS],
      currentStep: WITH_CHECKS,
    });

    const second = await load();
    await second.openWorkspace(workspace);
    expect(second.isDone(NO_CHECKS)).toBe(true);
    expect(second.getCurrentStep()).toBe(WITH_CHECKS);
  });

  it("keeps progress made before the workspace was chosen", async () => {
    const session = await load();
    session.markDone(NO_CHECKS);
    await session.openWorkspace(workspace);
    await session.flush();
    const reloaded = await load();
    await reloaded.openWorkspace(workspace);
    expect(reloaded.isDone(NO_CHECKS)).toBe(true);
  });
});

describe("resuming", () => {
  it("resumes at the first Step of a new Track", async () => {
    const session = await load();
    await session.openWorkspace(workspace);
    expect(session.getCurrentStep()).toBe(NO_CHECKS);
  });

  it("resumes at the Step the Learner last moved to", async () => {
    const session = await load();
    await session.openWorkspace(workspace);
    session.markDone(NO_CHECKS);
    session.openStep(WITH_CHECKS);
    await session.flush();

    const reopened = await load();
    expect((await reopened.openWorkspace(workspace)).notice).toBeUndefined();
    expect(reopened.getCurrentStep()).toBe(WITH_CHECKS);
    expect(reopened.getProgress()).toEqual({ doneSteps: [NO_CHECKS], currentStep: WITH_CHECKS });
  });

  it("moves the current Step forward when the Learner advances", async () => {
    const session = await load();
    await session.openWorkspace(workspace);
    session.markDone(NO_CHECKS);
    const next = session.advance(NO_CHECKS)!;
    session.openStep(next.id);
    await session.flush();
    expect(JSON.parse(await fs.readFile(progressPath, "utf8")).currentStep).toBe(WITH_CHECKS);
  });
});

describe("a progress file for another Track", () => {
  it("is ignored with a notice, and set aside as a .bak copy", async () => {
    await fs.mkdir(path.dirname(progressPath), { recursive: true });
    const other = JSON.stringify({ version: 1, trackTitle: "Other Track", doneSteps: ["x/1"] });
    await fs.writeFile(progressPath, other);

    const session = await load();
    const { notice } = await session.openWorkspace(workspace);
    expect(notice).toMatch(/another Track/);
    expect(notice).toMatch(/Other Track/);
    expect(session.getProgress().doneSteps).toEqual([]);
    expect(await fs.readFile(`${progressPath}.bak`, "utf8")).toBe(other);
  });
});

describe("a corrupt progress file", () => {
  it("starts fresh with a notice, and keeps a .bak copy of the corrupt file", async () => {
    await fs.mkdir(path.dirname(progressPath), { recursive: true });
    await fs.writeFile(progressPath, "{ not json");

    const session = await load();
    const { notice } = await session.openWorkspace(workspace);
    expect(notice).toMatch(/unreadable/);
    expect(session.getCurrentStep()).toBe(NO_CHECKS);
    expect(await fs.readFile(`${progressPath}.bak`, "utf8")).toBe("{ not json");
  });

  it("treats a file with the wrong shape as corrupt", async () => {
    const mem = memoryStore(JSON.stringify({ version: 1, trackTitle: "Fixture Track", doneSteps: "all" }));
    const session = await load();
    const { notice } = await session.openWorkspace(workspace, mem.store);
    expect(notice).toMatch(/doneSteps/);
    expect(mem.backups).toHaveLength(1);
    expect(session.getProgress().doneSteps).toEqual([]);
  });

  it("ignores saved Step ids that are not in the Track", async () => {
    const mem = memoryStore(
      JSON.stringify({ version: 1, trackTitle: "Fixture Track", doneSteps: [NO_CHECKS, "gone/9"], currentStep: "gone/9" }),
    );
    const session = await load();
    await session.openWorkspace(workspace, mem.store);
    expect(session.getProgress()).toEqual({ doneSteps: [NO_CHECKS], currentStep: NO_CHECKS });
  });
});

describe("back-navigation", () => {
  it("opens a done Step without moving the current Step back to it", async () => {
    const session = await load();
    await session.openWorkspace(workspace);
    session.markDone(NO_CHECKS);
    session.openStep(WITH_CHECKS);
    expect(session.openStep(NO_CHECKS)?.id).toBe(NO_CHECKS);
    expect(session.getCurrentStep()).toBe(WITH_CHECKS);
    expect(session.isDone(NO_CHECKS)).toBe(true);
    await session.flush();
  });

  it("still advances from a done Step that was opened back", async () => {
    const session = await load();
    await session.openWorkspace(workspace);
    session.markDone(NO_CHECKS);
    session.openStep(NO_CHECKS);
    expect(session.advance(NO_CHECKS)?.id).toBe(WITH_CHECKS);
    await session.flush();
  });

  it("does not move the current Step when a done Step is opened in a later session", async () => {
    const mem = memoryStore(
      JSON.stringify({ version: 1, trackTitle: "Fixture Track", doneSteps: [NO_CHECKS, WITH_CHECKS], currentStep: SECOND_LESSON }),
    );
    const session = await load();
    await session.openWorkspace(workspace, mem.store);
    session.openStep(WITH_CHECKS);
    expect(session.getCurrentStep()).toBe(SECOND_LESSON);
  });
});
