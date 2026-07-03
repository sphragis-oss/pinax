#!/usr/bin/env node
// Bundle TS test files with esbuild, then run them under node --test
import { build } from "esbuild";
import { readdirSync, rmSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, ".build");
rmSync(outDir, { recursive: true, force: true });

const entries = readdirSync(here).filter((f) => f.endsWith(".test.ts")).map((f) => join(here, f));
if (entries.length === 0) {
  console.error("no test files found");
  process.exit(1);
}

await build({
  entryPoints: entries,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "es2022",
  outdir: outDir,
  outExtension: { ".js": ".mjs" },
  sourcemap: "inline",
  logLevel: "warning",
  external: ["obsidian"],
});

const built = readdirSync(outDir).filter((f) => f.endsWith(".test.mjs")).map((f) => join(outDir, f));
const res = spawnSync(process.execPath, ["--test", ...built], { stdio: "inherit", cwd: resolve(here, "..") });
process.exit(res.status ?? 1);
