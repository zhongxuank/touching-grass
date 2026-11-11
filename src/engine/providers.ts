import { promises as fs } from "node:fs";
import * as path from "node:path";

/** The LLM Providers a Step can be tagged with. */
export const PROVIDERS = ["claude", "openai", "openrouter"] as const;
export type Provider = (typeof PROVIDERS)[number];

/** The environment variable that holds each Provider's key. */
export const PROVIDER_KEY_VARS: Record<Provider, string> = {
  claude: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
};

export const isProvider = (name: string): name is Provider => (PROVIDERS as readonly string[]).includes(name);

/** Name of the file in the Learner workspace that holds keys. */
export const ENV_FILE = ".env";

/** Parse `.env` text into variables: `KEY=value`, optional `export `, quotes, `#` comments. */
export function parseEnv(text: string): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const raw of text.split(/\r?\n/)) {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(raw);
    if (!m) continue;
    let value = m[2]!;
    const quote = value[0];
    if ((quote === '"' || quote === "'") && value.length >= 2 && value.endsWith(quote)) value = value.slice(1, -1);
    else value = value.replace(/\s+#.*$/, "");
    vars[m[1]!] = value;
  }
  return vars;
}

/** Reads the Learner workspace's `.env`. The seam tests replace; the default reads the real file. */
export type EnvReader = (workspace: string) => Promise<Record<string, string>>;

/** Reads `<workspace>/.env`. A missing or unreadable file is an empty set of variables. */
export const readEnvFile: EnvReader = async (workspace) => {
  try {
    return parseEnv(await fs.readFile(path.join(workspace, ENV_FILE), "utf8"));
  } catch {
    return {};
  }
};

/** Providers whose key is present and non-empty in `.env` or, as a fallback, the process environment. Never returns values. */
export function providersWithKeys(dotEnv: Record<string, string>, processEnv: NodeJS.ProcessEnv): Provider[] {
  return PROVIDERS.filter((p) => {
    const name = PROVIDER_KEY_VARS[p];
    return Boolean(dotEnv[name]?.trim()) || Boolean(processEnv[name]?.trim());
  });
}
