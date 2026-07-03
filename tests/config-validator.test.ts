import { test } from "node:test";
import assert from "node:assert/strict";
import { validateProfile, parseProfileJson } from "../src/core/validate";
import { safeVaultPath } from "../src/core/trust";
import sreProfile from "../profiles/sre/profile.json";
import readingProfile from "../profiles/reading/profile.json";

const minimal = (panes: unknown[]): unknown => ({ name: "t", layout: "grid", panes });

test("valid: shipped profiles pass", () => {
  assert.equal(validateProfile(sreProfile).ok, true, validateProfile(sreProfile).errors.join("; "));
  assert.equal(validateProfile(readingProfile).ok, true, validateProfile(readingProfile).errors.join("; "));
});

test("valid: every built-in widget type accepts a minimal pane", () => {
  const panes = [
    { type: "folder-latest", folder: "a" },
    { type: "folder-list", folder: "a/b" },
    { type: "markdown-embed", note: "a/{{today}}.md" },
    { type: "table", source: { folder: "a" } },
    { type: "form", target: { folder: "a" }, fields: [{ name: "x" }] },
    { type: "command-buttons", buttons: [{ label: "l", command: "c" }] },
    { type: "iframe", url: "https://example.com" },
    { type: "heatmap", source: { folder: "a" } },
    { type: "board", source: { folder: "a" }, groupBy: "status" },
    { type: "stat", source: { folder: "a" } },
    { type: "custom", widget: "ns.widget" },
  ];
  const res = validateProfile(minimal(panes));
  assert.equal(res.ok, true, res.errors.join("; "));
});

test("valid: schemaVersion 1, append-mode form, table paging", () => {
  const res = validateProfile({
    schemaVersion: 1,
    name: "t",
    layout: "grid",
    panes: [
      { type: "form", target: { note: "log.md", section: "## Log" }, fields: [{ name: "x" }] },
      { type: "table", source: { folder: "a" }, recursive: true, pageSize: 25 },
    ],
  });
  assert.equal(res.ok, true, res.errors.join("; "));
});

test("valid: heatmap/board/stat full configs", () => {
  const res = validateProfile(minimal([
    { type: "heatmap", source: { folder: "journal" }, weeks: 26, dateField: "date", recursive: true },
    { type: "board", source: { folder: "tasks" }, groupBy: "status", columns: ["todo", "done"], cardFields: ["due"], limit: 10 },
    { type: "stat", source: { folder: "journal" }, agg: "sum", field: "minutes", label: "min", sparkline: true, days: 14 },
  ]));
  assert.equal(res.ok, true, res.errors.join("; "));
});

test("valid: tag sources, actions, rolling-date where", () => {
  const res = validateProfile(minimal([
    { type: "table", source: { tags: ["#active", "project"] }, actions: [{ label: "done", set: { status: "done", closed: "{{today}}" } }] },
    { type: "board", source: { folder: "tasks" }, groupBy: "status", actions: [{ label: "urgent", set: { priority: 1 } }] },
    { type: "stat", source: { tags: ["#habit"], where: [{ field: "date", after: "{{today-7d}}" }] } },
  ]));
  assert.equal(res.ok, true, res.errors.join("; "));
});

test("valid: where filter, stat warn, refreshSec", () => {
  const res = validateProfile(minimal([
    { type: "table", source: { folder: "tasks", where: [{ field: "status", not: "done" }] }, refreshSec: 60 },
    { type: "board", source: { folder: "tasks", where: [{ field: "pts", above: 3 }, { field: "status", is: "todo" }] }, groupBy: "status" },
    { type: "stat", source: { folder: "k8s" }, agg: "sum", field: "degraded", warn: { above: 0 } },
  ]));
  assert.equal(res.ok, true, res.errors.join("; "));
});

test("valid: tabs layout", () => {
  const res = validateProfile({
    name: "t", layout: "tabs",
    tabs: [{ id: "one", label: "ONE", panes: [{ type: "folder-list", folder: "x" }] }],
  });
  assert.equal(res.ok, true, res.errors.join("; "));
});

const invalidCases: [string, unknown][] = [
  ["missing name", { layout: "grid", panes: [{ type: "folder-list", folder: "a" }] }],
  ["bad layout", { name: "t", layout: "columns", panes: [] }],
  ["grid without panes", { name: "t", layout: "grid" }],
  ["tabs without tabs", { name: "t", layout: "tabs" }],
  ["unknown pane type", minimal([{ type: "gizmo" }])],
  ["pane missing type", minimal([{ title: "x" }])],
  ["folder escaping vault", minimal([{ type: "folder-list", folder: "../secrets" }])],
  ["absolute folder", minimal([{ type: "folder-list", folder: "/etc" }])],
  ["inner .. segment", minimal([{ type: "folder-list", folder: "a/../../b" }])],
  ["iframe http url", minimal([{ type: "iframe", url: "http://example.com" }])],
  ["custom widget without namespace", minimal([{ type: "custom", widget: "nodots" }])],
  ["form without fields", minimal([{ type: "form", target: { folder: "a" } }])],
  ["form target with both folder and note", minimal([{ type: "form", target: { folder: "a", note: "b.md" }, fields: [{ name: "x" }] }])],
  ["unknown schemaVersion", { schemaVersion: 2, name: "t", layout: "grid", panes: [{ type: "folder-list", folder: "a" }] }],
  ["command-buttons empty", minimal([{ type: "command-buttons", buttons: [] }])],
  ["board without groupBy", minimal([{ type: "board", source: { folder: "a" } }])],
  ["heatmap weeks out of range", minimal([{ type: "heatmap", source: { folder: "a" }, weeks: 99 }])],
  ["stat agg sum without field", minimal([{ type: "stat", source: { folder: "a" }, agg: "sum" }])],
  ["where clause without operator", minimal([{ type: "table", source: { folder: "a", where: [{ field: "x" }] } }])],
  ["refreshSec below minimum", minimal([{ type: "folder-list", folder: "a", refreshSec: 1 }])],
  ["stat warn without bounds", minimal([{ type: "stat", source: { folder: "a" }, warn: {} }])],
  ["source with both folder and tags", minimal([{ type: "table", source: { folder: "a", tags: ["#x"] } }])],
  ["source with neither folder nor tags", minimal([{ type: "table", source: {} }])],
  ["action without set", minimal([{ type: "table", source: { folder: "a" }, actions: [{ label: "x" }] }])],
  ["action with empty set", minimal([{ type: "table", source: { folder: "a" }, actions: [{ label: "x", set: {} }] }])],
  ["extra property on pane", minimal([{ type: "folder-list", folder: "a", bogus: 1 }])],
  ["profile is array", [1, 2]],
  ["profile is null", null],
];

for (const [label, data] of invalidCases) {
  test(`invalid: ${label}`, () => {
    const res = validateProfile(data);
    assert.equal(res.ok, false);
    assert.ok(res.errors.length > 0);
  });
}

test("malformed: broken JSON text is reported, not thrown", () => {
  const res = parseProfileJson('{"name": "x", layout: grid');
  assert.equal(res.ok, false);
  assert.match(res.errors[0], /not valid JSON/);
});

test("safeVaultPath: accepts and normalizes vault-relative paths", () => {
  assert.equal(safeVaultPath("a/b/c"), "a/b/c");
  assert.equal(safeVaultPath("./a//b/"), "a/b");
});

test("safeVaultPath: rejects escapes", () => {
  for (const bad of ["../x", "a/../../b", "/abs", "C:evil", "a\\b", "", "   ", ".."]) {
    assert.throws(() => safeVaultPath(bad), new RegExp("pinax:"), `should reject "${bad}"`);
  }
});
