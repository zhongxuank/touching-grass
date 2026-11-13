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
      version: 2,
      tracks: { "Fixture Track": { doneSteps: [NO_CHECKS], currentStep: WITH_CHECKS } },
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

describe("resetting a Track", () => {
  it("clears this Track's progress, saves it, and keeps other Tracks' entries", async () => {
    const other = { doneSteps: ["01-a/1"], currentStep: "01-a/2" };
    const { store } = memoryStore(JSON.stringify({ version: 2, tracks: { "Other Track": other } }));
    const session = await load();
    await session.openWorkspace(workspace, store);
    session.markDone(NO_CHECKS);
    session.openStep(WITH_CHECKS);
    session.resetProgress();
    expect(await session.flush()).toBeUndefined();

    expect(session.isDone(NO_CHECKS)).toBe(false);
    expect(session.getCurrentStep()).toBe(NO_CHECKS);
    const saved = JSON.parse((await store.read())!);
    expect(saved.tracks["Fixture Track"]).toEqual({ doneSteps: [], currentStep: NO_CHECKS });
    expect(saved.tracks["Other Track"]).toEqual(other);
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
    expect(JSON.parse(await fs.readFile(progressPath, "utf8")).tracks["Fixture Track"].currentStep).toBe(WITH_CHECKS);
  });
});

describe("a version 1 progress file", () => {
  it("is migrated on read and never set aside", async () => {
    await fs.mkdir(path.dirname(progressPath), { recursive: true });
    await fs.writeFile(
      progressPath,
      JSON.stringify({
        version: 1,
        trackTitle: "Fixture Track",
        doneSteps: [NO_CHECKS],
        currentStep: WITH_CHECKS,
        skippedSteps: [NO_CHECKS],
        chosenProvider: "claude",
      }),
    );
    const session = await load();
    expect(await session.openWorkspace(workspace)).toEqual({});
    expect(session.isDone(NO_CHECKS)).toBe(true);
    expect(session.getCurrentStep()).toBe(WITH_CHECKS);
    expect(session.isSkipped(NO_CHECKS)).toBe(true);
    expect(session.getChosenProvider()).toBe("claude");
    await session.flush();
    expect(await fs.stat(`${progressPath}.bak`).then(() => true, () => false)).toBe(false);
    expect(JSON.parse(await fs.readFile(progressPath, "utf8"))).toEqual({
      version: 2,
      tracks: {
        "Fixture Track": {
          doneSteps: [NO_CHECKS],
          currentStep: WITH_CHECKS,
          skippedSteps: [NO_CHECKS],
          chosenProvider: "claude",
        },
      },
    });
  });

  it("keeps a version 1 file for another Track as that Track's entry", async () => {
    await fs.mkdir(path.dirname(progressPath), { recursive: true });
    await fs.writeFile(progressPath, JSON.stringify({ version: 1, trackTitle: "Other Track", doneSteps: ["x/1"] }));
    const session = await load();
    expect(await session.openWorkspace(workspace)).toEqual({});
    expect(session.getProgress().doneSteps).toEqual([]);
    session.markDone(NO_CHECKS);
    await session.flush();
    const saved = JSON.parse(await fs.readFile(progressPath, "utf8"));
    expect(saved.tracks["Other Track"]).toEqual({ doneSteps: ["x/1"] });
    expect(saved.tracks["Fixture Track"].doneSteps).toEqual([NO_CHECKS]);
    expect(await fs.stat(`${progressPath}.bak`).then(() => true, () => false)).toBe(false);
  });
});

describe("two Tracks in one workspace", () => {
  async function loadOther() {
    const result = await loadTrack(fixture("provider-track"), {
      checkRunner: { run: async () => ({ ok: true, results: [] }) },
      processEnv: {},
      readEnv: async () => ({}),
    });
    if (!result.ok) throw new Error(JSON.stringify(result.errors));
    return result.session;
  }

  it("keeps each Track's progress in its own entry", async () => {
    const a = await load();
    await a.openWorkspace(workspace);
    a.markDone(NO_CHECKS);
    await a.flush();

    const b = await loadOther();
    expect((await b.openWorkspace(workspace)).notice).toBeUndefined();
    expect(b.getProgress().doneSteps).toEqual([]);
    const firstStep = b.getCurrentStep()!;
    b.markDone(firstStep);
    await b.flush();

    const saved = JSON.parse(await fs.readFile(progressPath, "utf8"));
    expect(Object.keys(saved.tracks).sort()).toEqual(["Fixture Track", "Provider Track"]);
    expect(saved.tracks["Fixture Track"].doneSteps).toEqual([NO_CHECKS]);
    expect(saved.tracks["Provider Track"].doneSteps).toEqual([firstStep]);
    expect(await fs.stat(`${progressPath}.bak`).then(() => true, () => false)).toBe(false);

    const again = await load();
    await again.openWorkspace(workspace);
    expect(again.isDone(NO_CHECKS)).toBe(true);
  });

  it("does not undo another Track's progress saved while this one was open", async () => {
    const a = await load();
    await a.openWorkspace(workspace);
    const b = await loadOther();
    await b.openWorkspace(workspace);
    const firstStep = b.getCurrentStep()!;
    b.markDone(firstStep);
    await b.flush();
    a.markDone(NO_CHECKS);
    await a.flush();
    const saved = JSON.parse(await fs.readFile(progressPath, "utf8"));
    expect(saved.tracks["Provider Track"].doneSteps).toEqual([firstStep]);
    expect(saved.tracks["Fixture Track"].doneSteps).toEqual([NO_CHECKS]);
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

  it("treats a version 2 file with a malformed Track entry as corrupt", async () => {
    const mem = memoryStore(JSON.stringify({ version: 2, tracks: { "Fixture Track": { doneSteps: "all" } } }));
    const session = await load();
    const { notice } = await session.openWorkspace(workspace, mem.store);
    expect(notice).toMatch(/doneSteps/);
    expect(mem.backups).toHaveLength(1);
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
