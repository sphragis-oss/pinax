#!/usr/bin/env node
// Perf guardrail: folder vs tag sources + full render against a 10k-note mock vault
import { createRequire } from "node:module";
import Module from "node:module";
import { writeSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import * as mock from "../tests/harness/obsidian-mock.mjs";

const log = (s) => writeSync(1, s + "\n");

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);

const origLoad = Module._load;
Module._load = function (request, ...rest) {
  if (request === "obsidian") return mock;
  return origLoad.call(this, request, ...rest);
};

mock.setupDom();

const NOTES = Number(process.env.BENCH_NOTES || 10000);
const app = new mock.App();
for (let i = 0; i < NOTES; i++) {
  const folder = i % 10 === 0 ? "tasks" : `misc/f${i % 50}`;
  const tag = i % 20 === 0 ? "tags: active" : "tags: other";
  app.vault.putFile(
    `${folder}/note-${i}.md`,
    ["---", `name: note-${i}`, `status: ${i % 3 === 0 ? "todo" : "done"}`, `rank: ${i % 100}`, tag, "---", `body #inline${i % 7}`].join("\n"),
  );
}

// real Obsidian caches metadata; memoize the mock parser so we measure pinax, not the mock
const rawGetFileCache = app.metadataCache.getFileCache;
const memo = new Map();
app.metadataCache.getFileCache = (file) => {
  let c = memo.get(file.path);
  if (!c) { c = rawGetFileCache(file); memo.set(file.path, c); }
  return c;
};

const manifest = { id: "pinax", dir: ".obsidian/plugins/pinax", name: "Pinax", version: "bench" };
const PluginClass = require(resolve(root, "main.js")).default;
const plugin = new PluginClass(app, manifest);
await plugin.onload();

const profile = {
  schemaVersion: 1,
  name: "Bench",
  layout: "grid",
  panes: [
    { type: "table", title: "FOLDER", width: "full", source: { folder: "tasks", where: [{ field: "status", is: "todo" }] }, columns: ["name", "status", "rank"], filter: false, pageSize: 50 },
    { type: "board", title: "BOARD", width: "full", source: { folder: "tasks" }, groupBy: "status", limit: 20 },
    { type: "table", title: "TAGS", width: "full", source: { tags: ["#active"] }, columns: ["name"], filter: false, pageSize: 50 },
    { type: "stat", title: "STAT", source: { tags: ["#active"] }, agg: "sum", field: "rank" },
    { type: "heatmap", title: "HEAT", source: { folder: "tasks" }, weeks: 26 },
  ],
};
await app.vault.adapter.mkdir(".obsidian/plugins/pinax/profiles/bench");
await app.vault.adapter.write(".obsidian/plugins/pinax/profiles/bench/profile.json", JSON.stringify(profile));
await plugin.setActiveProfile("bench");

const leaf = app.workspace.getLeaf();
await leaf.setViewState({ type: "pinax-view", active: true });
const view = leaf.view;

async function time(label, fn, runs = 5) {
  await fn();
  const t0 = performance.now();
  for (let i = 0; i < runs; i++) await fn();
  const ms = (performance.now() - t0) / runs;
  log(`${label.padEnd(34)} ${ms.toFixed(1)} ms/run (${runs} runs)`);
  return ms;
}

log(`vault: ${NOTES} notes (${Math.round(NOTES / 10)} in tasks/, ${Math.round(NOTES / 20)} tagged #active)\n`);
const api = globalThis.window.pinax;
await time("records(folder tasks/)", () => api.vault.records("tasks"));
const full = await time("full dashboard render (5 panes)", () => view.render());

if (full > 250) {
  log(`\nFAIL: full render ${full.toFixed(1)}ms exceeds 250ms budget`);
  process.exit(1);
}
log("\nOK: within 250ms full-render budget");
process.exit(0);
