import { describe, expect, it } from "vitest";
import * as path from "node:path";
import { createCheckRunner, loadTrack, type CheckRunRequest, type CheckRunner, type CheckResult } from "../../src/engine";

const fixture = (name: string) => path.join(__dirname, "..", "fixtures", name);

/** A fake Check runner: every Check passes unless its name is in `failing`. */
function fakeRunner(failing: string[] = []) {
  const requests: CheckRunRequest[] = [];
  const runner: CheckRunner = {
    async run(request) {
      requests.push(request);
      const results: CheckResult[] = request.checks.map((c) => ({
        check: c.name,
        passed: !failing.includes(c.name),
        output: failing.includes(c.name) ? "assert failed" : "ok",
      }));
      return { ok: true, results };
    },
  };
  return { runner, requests };
}

async function load(runner: CheckRunner) {
  const result = await loadTrack(fixture("valid-track"), { checkRunner: runner });
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return result.session;
}

const NO_CHECKS = "01-first/1";
const WITH_CHECKS = "01-first/2";
const LAST_OF_LESSON_ONE = WITH_CHECKS;

describe("running Checks", () => {
  it("asks for a workspace before running Checks", async () => {
    const { runner, requests } = fakeRunner();
    const session = await load(runner);
    expect(await session.runChecks(WITH_CHECKS)).toEqual({ status: "no-workspace" });
    expect(requests).toEqual([]);
  });

  it("runs the Step's Check files from the Track's checks folder in the Learner workspace", async () => {
    const { runner, requests } = fakeRunner();
    const session = await load(runner);
    session.setWorkspace("/learner/agent");
    await session.runChecks(WITH_CHECKS);
    expect(requests).toEqual([
      {
        workspace: "/learner/agent",
        checks: [{ name: "test_key.py", file: path.join(fixture("valid-track"), "checks", "test_key.py") }],
      },
    ]);
  });

  it("marks the Step done when all its Checks pass", async () => {
    const session = await load(fakeRunner().runner);
    session.setWorkspace("/w");
    const outcome = await session.runChecks(WITH_CHECKS);
    expect(outcome).toMatchObject({ status: "ran", done: true });
    expect(session.isDone(WITH_CHECKS)).toBe(true);
  });

  it("leaves the Step not done when a Check fails, and reports the output", async () => {
    const session = await load(fakeRunner(["test_key.py"]).runner);
    session.setWorkspace("/w");
    const outcome = await session.runChecks(WITH_CHECKS);
    expect(outcome).toEqual({
      status: "ran",
      done: false,
      results: [{ check: "test_key.py", passed: false, output: "assert failed" }],
    });
    expect(session.isDone(WITH_CHECKS)).toBe(false);
  });

  it("does not undo a done Step when a later run fails", async () => {
    let fail = false;
    const runner: CheckRunner = {
      async run(r) {
        return { ok: true, results: r.checks.map((c) => ({ check: c.name, passed: !fail, output: "" })) };
      },
    };
    const session = await load(runner);
    session.setWorkspace("/w");
    await session.runChecks(WITH_CHECKS);
    fail = true;
    await session.runChecks(WITH_CHECKS);
    expect(session.isDone(WITH_CHECKS)).toBe(true);
  });

  it("reports missing tooling without marking anything done", async () => {
    const runner: CheckRunner = { run: async () => ({ ok: false, reason: "tooling-missing", message: "no uv" }) };
    const session = await load(runner);
    session.setWorkspace("/w");
    expect(await session.runChecks(WITH_CHECKS)).toEqual({ status: "tooling-missing", message: "no uv" });
    expect(session.isDone(WITH_CHECKS)).toBe(false);
  });
});

describe("a Step with no Checks", () => {
  it("is done once the Learner marks it done", async () => {
    const session = await load(fakeRunner().runner);
    expect(session.markDone(NO_CHECKS)).toBe(true);
    expect(session.isDone(NO_CHECKS)).toBe(true);
  });

  it("cannot be marked done by hand when the Step has Checks", async () => {
    const session = await load(fakeRunner().runner);
    expect(session.markDone(WITH_CHECKS)).toBe(false);
    expect(session.isDone(WITH_CHECKS)).toBe(false);
  });
});

describe("advancing", () => {
  it("does not advance until the Step is done", async () => {
    const session = await load(fakeRunner().runner);
    expect(session.advance(NO_CHECKS)).toBeUndefined();
  });

  it("moves to the next Step once done", async () => {
    const session = await load(fakeRunner().runner);
    session.markDone(NO_CHECKS);
    expect(session.advance(NO_CHECKS)?.id).toBe(WITH_CHECKS);
  });

  it("crosses into the next Lesson", async () => {
    const session = await load(fakeRunner().runner);
    session.setWorkspace("/w");
    await session.runChecks(LAST_OF_LESSON_ONE);
    expect(session.advance(LAST_OF_LESSON_ONE)?.id).toBe("02-second/1");
  });

  it("has no next Step after the last one", async () => {
    const session = await load(fakeRunner().runner);
    session.markDone("02-second/1");
    expect(session.advance("02-second/1")).toBeUndefined();
  });
});

describe("progress", () => {
  it("is plain data listing done Steps in Track order", async () => {
    const session = await load(fakeRunner().runner);
    session.markDone("02-second/1");
    session.markDone(NO_CHECKS);
    expect(JSON.parse(JSON.stringify(session.getProgress()))).toEqual({
      doneSteps: [NO_CHECKS, "02-second/1"],
    });
  });
});

describe("Check runner (uv + pytest)", () => {
  const project = fixture("check-project");
  const workspace = path.join(project, "workspace");
  const check = (name: string) => ({ name, file: path.join(project, "checks", name) });

  it("reports a passing and a failing Check, with output on failure", async () => {
    const outcome = await createCheckRunner().run({
      workspace,
      checks: [check("test_passing.py"), check("test_failing.py")],
    });
    if (!outcome.ok) throw new Error(outcome.message);
    const [pass, fail] = outcome.results;
    expect(pass).toMatchObject({ check: "test_passing.py", passed: true });
    expect(fail).toMatchObject({ check: "test_failing.py", passed: false });
    expect(fail!.output).toContain("test_greet_is_shouted");
    expect(fail!.output).toContain("HELLO, WORLD");
  }, 60_000);

  it("says so clearly when uv is not found", async () => {
    const outcome = await createCheckRunner({ uvCommand: "uv-does-not-exist" }).run({
      workspace,
      checks: [check("test_passing.py")],
    });
    expect(outcome).toMatchObject({ ok: false, reason: "tooling-missing" });
    expect(!outcome.ok && outcome.message).toMatch(/uv was not found/);
  });

  it("says so clearly when Python is not found", async () => {
    const outcome = await createCheckRunner({ env: { UV_PYTHON: "/no/such/python" } }).run({
      workspace,
      checks: [check("test_passing.py")],
    });
    expect(outcome).toMatchObject({ ok: false, reason: "tooling-missing" });
    expect(!outcome.ok && outcome.message).toMatch(/Python was not found/);
  }, 60_000);
});
