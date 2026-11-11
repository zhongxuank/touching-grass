import { execFile } from "node:child_process";
import { delimiter } from "node:path";
import type { CheckResult, CheckRunOutcome, CheckRunner, CheckRunRequest } from "./types";

export interface CheckRunnerOptions {
  /** The uv executable. Defaults to `uv` on PATH. */
  uvCommand?: string;
  /** Extra environment for uv, e.g. to point it at a Python. */
  env?: NodeJS.ProcessEnv;
}

interface Exec {
  code: number | "ENOENT" | "other";
  output: string;
}

function exec(command: string, args: string[], cwd: string, env: NodeJS.ProcessEnv): Promise<Exec> {
  return new Promise((resolve) => {
    execFile(command, args, { cwd, env, maxBuffer: 8 * 1024 * 1024 }, (err, stdout, stderr) => {
      const output = `${stdout}${stderr}`;
      if (!err) return resolve({ code: 0, output });
      const e = err as NodeJS.ErrnoException & { code?: number | string };
      if (e.code === "ENOENT") return resolve({ code: "ENOENT", output });
      resolve({ code: typeof e.code === "number" ? e.code : "other", output: output || e.message });
    });
  });
}

const NO_PYTHON = /no interpreter found|no python|python.*not found|failed to (find|discover).*python/i;

/**
 * Runs each Check file with pytest through uv, with the Learner workspace as cwd and on PYTHONPATH so
 * the Check can import the Learner's code. One Check file is one Check: it passes when pytest exits 0.
 */
export function createCheckRunner(options: CheckRunnerOptions = {}): CheckRunner {
  const uv = options.uvCommand ?? "uv";
  return {
    async run({ workspace, checks, env: requestEnv }: CheckRunRequest): Promise<CheckRunOutcome> {
      const env: NodeJS.ProcessEnv = {
        ...process.env,
        ...options.env,
        ...requestEnv,
        PYTHONPATH: [workspace, process.env.PYTHONPATH].filter(Boolean).join(delimiter),
        PYTHONDONTWRITEBYTECODE: "1",
      };
      const results: CheckResult[] = [];
      for (const { name, file } of checks) {
        const r = await exec(
          uv,
          ["run", "--with", "pytest", "pytest", "-q", "-p", "no:cacheprovider", "--rootdir", workspace, file],
          workspace,
          env,
        );
        if (r.code === "ENOENT") {
          return {
            ok: false,
            reason: "tooling-missing",
            message: "uv was not found. Install uv (https://docs.astral.sh/uv/) and make sure it is on your PATH.",
          };
        }
        if (r.code !== 0 && NO_PYTHON.test(r.output)) {
          return {
            ok: false,
            reason: "tooling-missing",
            message: `Python was not found by uv. Install Python 3 (or run \`uv python install\`).\n${r.output.trim()}`,
          };
        }
        results.push({ check: name, passed: r.code === 0, output: r.output.trim() });
      }
      return { ok: true, results };
    },
  };
}
