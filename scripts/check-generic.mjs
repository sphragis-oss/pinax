#!/usr/bin/env node
// Fails if the framework core references any vault- or domain-specific concept.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CORE = [join(root, "src", "core"), join(root, "src", "main.ts")];

const BANNED = [
  /claudevault/i, /raw\/scans/i, /raw\/daily/i, /\bsre\b/i, /\bcncf\b/i,
  /\bjira\b/i, /\bworkable\b/i, /kubernetes/i, /terraform/i, /\bhelm\b/i,
  /clotributor/i, /firecrawl/i, /ollama/i, /graphify/i, /\bcrm\b/i, /\bbookshelf\b/i, /reading\.shelf/i,
  /trending/i, /\bkep\b/i, /\bcve\b/i, /datadog/i, /standup/i,
];

function* walk(p) {
  const st = statSync(p);
  if (st.isFile()) { yield p; return; }
  for (const e of readdirSync(p)) yield* walk(join(p, e));
}

let bad = 0;
for (const target of CORE) {
  for (const file of walk(target)) {
    if (!file.endsWith(".ts")) continue;
    const lines = readFileSync(file, "utf8").split("\n");
    lines.forEach((line, i) => {
      for (const re of BANNED) {
        if (re.test(line)) {
          console.error(`${file}:${i + 1}: matches ${re} -> ${line.trim()}`);
          bad++;
        }
      }
    });
  }
}

if (bad > 0) {
  console.error(`\nFAIL: ${bad} domain-specific reference(s) in core`);
  process.exit(1);
}
console.log("OK: src/core and src/main.ts contain no vault/domain references");
