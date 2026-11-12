import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { copyReferenceFolder, loadTrack, PROGRESS_DIR, PROGRESS_FILE } from "../../src/engine";

const fixture = (name: string) => path.join(__dirname, "..", "fixtures", "builds-on", name);
const EARLIER_STEPS = ["01-start/1", "01-start/2"];

let workspace: string;
let progressPath: string;

beforeEach(async () => {
  workspace = await fs.mkdtemp(path.join(os.tmpdir(), "tg-builds-on-"));
  progressPath = path.join(workspace, PROGRESS_DIR, PROGRESS_FILE);
});

afterEach(async () => {
  await fs.rm(workspace, { recursive: true, force: true });
});

async function open(name: string, processEnv: NodeJS.ProcessEnv = {}) {
  const result = await loadTrack(fixture(name), { processEnv, readEnv: async () => ({}) });
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  await result.session.openWorkspace(workspace);
  return result.session;
}

async function finishEarlier() {
  const earlier = await open("earlier");
  for (const id of EARLIER_STEPS) earlier.markDone(id);
  await earlier.flush();
  return earlier;
}

const exists = (p: string) => fs.stat(p).then(() => true, () => false);

describe("builds_on in track.md", () => {
  it("is exposed on the Track", async () => {
    const result = await loadTrack(fixture("later"));
    if (!result.ok) throw new Error(JSON.stringify(result.errors));
    expect(result.session.track.buildsOn).toBe("Earlier Track");
  });

  it("is absent on a Track that builds on nothing", async () => {
    const result = await loadTrack(fixture("earlier"));
    if (!result.ok) throw new Error(JSON.stringify(result.errors));
    expect(result.session.track.buildsOn).toBeUndefined();
  });

  it("must be a string", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "tg-bad-builds-on-"));
    try {
      await fs.cp(fixture("later"), dir, { recursive: true });
      const trackFile = path.join(dir, "track.md");
      const text = await fs.readFile(trackFile, "utf8");
      await fs.writeFile(trackFile, text.replace("builds_on: Earlier Track", "builds_on:\n  - Earlier Track"));
      const result = await loadTrack(dir);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors[0]).toMatchObject({ file: "track.md", line: 1 });
        expect(result.errors[0]!.message).toMatch(/builds_on/);
      }
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});

describe("the notice for a Track that builds on another", () => {
  it("is absent for a Track that builds on nothing", async () => {
    expect(await (await open("earlier")).getBuildsOn()).toBeUndefined();
  });

  it("asks to finish the earlier Track first when it is not finished", async () => {
    const later = await open("later");
    expect(await later.getBuildsOn()).toEqual({ state: "unfinished", title: "Earlier Track" });
  });

  it("still asks when the earlier Track is only partly done", async () => {
    const earlier = await open("earlier");
    earlier.markDone(EARLIER_STEPS[0]!);
    await earlier.flush();
    expect((await (await open("later")).getBuildsOn())?.state).toBe("unfinished");
  });

  it("is absent once every Step of the earlier Track is done in this workspace", async () => {
    await finishEarlier();
    expect(await (await open("later")).getBuildsOn()).toBeUndefined();
  });

  it("says the earlier Track is missing when no sibling folder has its title", async () => {
    expect(await (await open("orphan")).getBuildsOn()).toEqual({ state: "missing", title: "Missing Track" });
  });
});

describe("Start from its finished code", () => {
  it("copies the earlier Track's reference folder into the workspace", async () => {
    const later = await open("later");
    const outcome = await later.startFromEarlierCode();
    expect(outcome).toEqual({ status: "copied", copied: ["app/extra.py", "app/main.py"], skipped: [] });
    expect(await fs.readFile(path.join(workspace, "app/extra.py"), "utf8")).toBe("EXTRA = 1\n");
    expect(await exists(path.join(workspace, "app/__pycache__"))).toBe(false);
  });

  it("never overwrites a file the Learner already has, and lists it as skipped", async () => {
    await fs.mkdir(path.join(workspace, "app"), { recursive: true });
    await fs.writeFile(path.join(workspace, "app/main.py"), "# mine\n");
    const later = await open("later");
    const outcome = await later.startFromEarlierCode();
    expect(outcome).toEqual({ status: "copied", copied: ["app/extra.py"], skipped: ["app/main.py"] });
    expect(await fs.readFile(path.join(workspace, "app/main.py"), "utf8")).toBe("# mine\n");
  });

  it("records in progress that the starter was used, and then shows no notice", async () => {
    const later = await open("later");
    await later.startFromEarlierCode();
    expect(await later.flush()).toBeUndefined();
    const saved = JSON.parse(await fs.readFile(progressPath, "utf8"));
    expect(saved.tracks["Later Track"].usedStarter).toBe(true);
    expect(await later.getBuildsOn()).toBeUndefined();

    const reopened = await open("later");
    expect(await reopened.getBuildsOn()).toBeUndefined();
  });

  it("does not touch the earlier Track's progress", async () => {
    const later = await open("later");
    await later.startFromEarlierCode();
    await later.flush();
    const saved = JSON.parse(await fs.readFile(progressPath, "utf8"));
    expect(saved.tracks["Earlier Track"]?.doneSteps ?? []).toEqual([]);
  });

  it("is refused without a workspace", async () => {
    const result = await loadTrack(fixture("later"));
    if (!result.ok) throw new Error(JSON.stringify(result.errors));
    expect(await result.session.startFromEarlierCode()).toEqual({ status: "no-workspace" });
  });

  it("is refused when the earlier Track is missing", async () => {
    expect(await (await open("orphan")).startFromEarlierCode()).toEqual({ status: "missing" });
  });
});

describe("the Provider carries over", () => {
  it("uses the earlier Track's chosen Provider unless the Learner already chose", async () => {
    await fs.mkdir(path.dirname(progressPath), { recursive: true });
    await fs.writeFile(
      progressPath,
      JSON.stringify({
        version: 2,
        tracks: { "Earlier Track": { doneSteps: [], chosenProvider: "openai" } },
      }),
    );
    const later = await open("later", { OPENAI_API_KEY: "k" });
    expect(later.getChosenProvider()).toBe("openai");
    await later.flush();
    const saved = JSON.parse(await fs.readFile(progressPath, "utf8"));
    expect(saved.tracks["Later Track"].chosenProvider).toBe("openai");
  });

  it("keeps the Learner's own choice in the new Track", async () => {
    await fs.mkdir(path.dirname(progressPath), { recursive: true });
    await fs.writeFile(
      progressPath,
      JSON.stringify({
        version: 2,
        tracks: {
          "Earlier Track": { doneSteps: [], chosenProvider: "openai" },
          "Later Track": { doneSteps: [], chosenProvider: "claude" },
        },
      }),
    );
    expect((await open("later")).getChosenProvider()).toBe("claude");
  });

  it("chooses nothing when the earlier Track chose nothing", async () => {
    expect((await open("later")).getChosenProvider()).toBeUndefined();
  });
});

describe("copyReferenceFolder", () => {
  let from: string;
  beforeEach(async () => {
    from = await fs.mkdtemp(path.join(os.tmpdir(), "tg-reference-"));
    await fs.mkdir(path.join(from, "pkg/sub"), { recursive: true });
    await fs.mkdir(path.join(from, "__pycache__"));
    await fs.writeFile(path.join(from, "a.txt"), "A");
    await fs.writeFile(path.join(from, "pkg/b.txt"), "B");
    await fs.writeFile(path.join(from, "pkg/sub/c.txt"), "C");
    await fs.writeFile(path.join(from, "__pycache__/a.pyc"), "x");
  });
  afterEach(async () => {
    await fs.rm(from, { recursive: true, force: true });
  });

  it("copies every file, creating folders, and returns the copied paths", async () => {
    const result = await copyReferenceFolder(from, workspace);
    expect(result).toEqual({ copied: ["a.txt", "pkg/b.txt", "pkg/sub/c.txt"], skipped: [] });
    expect(await fs.readFile(path.join(workspace, "pkg/sub/c.txt"), "utf8")).toBe("C");
  });

  it("skips files that exist and leaves them alone", async () => {
    await fs.mkdir(path.join(workspace, "pkg"));
    await fs.writeFile(path.join(workspace, "pkg/b.txt"), "mine");
    const result = await copyReferenceFolder(from, workspace);
    expect(result).toEqual({ copied: ["a.txt", "pkg/sub/c.txt"], skipped: ["pkg/b.txt"] });
    expect(await fs.readFile(path.join(workspace, "pkg/b.txt"), "utf8")).toBe("mine");
  });

  it("copies nothing the second time", async () => {
    await copyReferenceFolder(from, workspace);
    const again = await copyReferenceFolder(from, workspace);
    expect(again).toEqual({ copied: [], skipped: ["a.txt", "pkg/b.txt", "pkg/sub/c.txt"] });
  });
});
