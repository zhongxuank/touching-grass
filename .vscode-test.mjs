import { defineConfig } from "@vscode/test-cli";
import * as path from "node:path";

export default defineConfig({
  files: "dist/test/smoke.js",
  workspaceFolder: path.resolve("test/fixtures/valid-track"),
  launchArgs: ["--disable-extensions"],
  mocha: { ui: "bdd", timeout: 30000 },
});
