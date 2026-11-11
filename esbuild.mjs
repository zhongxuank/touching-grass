import { build, context } from "esbuild";

const watch = process.argv.includes("--watch");
const options = {
  entryPoints: { extension: "src/extension.ts", "test/smoke": "test/smoke/smoke.test.ts" },
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node20",
  external: ["vscode", "mocha"],
  outdir: "dist",
  sourcemap: true,
  logLevel: "info",
};

if (watch) await (await context(options)).watch();
else await build(options);
