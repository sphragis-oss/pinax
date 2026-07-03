import { test } from "node:test";
import assert from "node:assert/strict";
import type { App } from "obsidian";
import { expandVars, todayStr } from "../src/core/template";

const app = { vault: { getName: () => "myvault" } } as unknown as App;

function localDay(offset: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${String(d.getDate()).padStart(2, "0")}`;
}

test("expandVars: {{today}} is the local date", () => {
  assert.equal(expandVars("daily/{{today}}.md", app), `daily/${todayStr()}.md`);
  assert.equal(todayStr(), localDay(0));
});

test("expandVars: rolling offsets {{today-7d}} / {{today+1d}}", () => {
  assert.equal(expandVars("{{today-7d}}", app), localDay(-7));
  assert.equal(expandVars("{{today+1d}}", app), localDay(1));
  assert.equal(expandVars("from {{today-30d}} to {{today}}", app), `from ${localDay(-30)} to ${localDay(0)}`);
});

test("expandVars: {{vaultName}} and untouched strings", () => {
  assert.equal(expandVars("{{vaultName}}/notes", app), "myvault/notes");
  assert.equal(expandVars("plain/path.md", app), "plain/path.md");
});
