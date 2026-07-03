import { test } from "node:test";
import assert from "node:assert/strict";
import { applyWhere } from "../src/core/where";
import type { NoteRecord } from "../src/core/types";

const rows: NoteRecord[] = [
  { path: "t/a.md", name: "a", mtime: 100, fields: { status: "todo", pts: 3 } },
  { path: "t/b.md", name: "b", mtime: 200, fields: { status: "done", pts: 8 } },
  { path: "t/c.md", name: "c", mtime: 300, fields: { pts: 5 } },
];

test("where: is / not on frontmatter field", () => {
  assert.deepEqual(applyWhere(rows, [{ field: "status", is: "todo" }]).map((r) => r.name), ["a"]);
  assert.deepEqual(applyWhere(rows, [{ field: "status", not: "done" }]).map((r) => r.name), ["a", "c"]);
});

test("where: above / below numeric", () => {
  assert.deepEqual(applyWhere(rows, [{ field: "pts", above: 4 }]).map((r) => r.name), ["b", "c"]);
  assert.deepEqual(applyWhere(rows, [{ field: "pts", below: 4 }]).map((r) => r.name), ["a"]);
});

test("where: clauses AND together; synthetic name field works", () => {
  assert.deepEqual(applyWhere(rows, [{ field: "pts", above: 2 }, { field: "status", is: "done" }]).map((r) => r.name), ["b"]);
  assert.deepEqual(applyWhere(rows, [{ field: "name", is: "c" }]).map((r) => r.name), ["c"]);
});

test("where: missing field only survives 'not'", () => {
  assert.deepEqual(applyWhere(rows, [{ field: "status", is: "todo" }]).length, 1);
  assert.ok(applyWhere(rows, [{ field: "status", not: "done" }]).some((r) => r.name === "c"));
});

test("where: non-array or empty input filters nothing", () => {
  assert.equal(applyWhere(rows, undefined).length, 3);
  assert.equal(applyWhere(rows, []).length, 3);
  assert.equal(applyWhere(rows, "bogus").length, 3);
});

test("where: after/before compare as strings with token expansion", () => {
  const app = { vault: { getName: () => "v" } } as never;
  const today = new Date();
  const iso = (off: number): string => {
    const d = new Date(today);
    d.setDate(d.getDate() + off);
    const m = String(d.getMonth() + 1).padStart(2, "0");
    return `${d.getFullYear()}-${m}-${String(d.getDate()).padStart(2, "0")}`;
  };
  const dated = [
    { path: "e/recent.md", name: "recent", mtime: 1, fields: { date: iso(-2) } },
    { path: "e/old.md", name: "old", mtime: 2, fields: { date: "2000-01-01" } },
  ];
  assert.deepEqual(applyWhere(dated, [{ field: "date", after: "{{today-7d}}" }], app).map((r) => r.name), ["recent"]);
  assert.deepEqual(applyWhere(dated, [{ field: "date", before: "{{today-7d}}" }], app).map((r) => r.name), ["old"]);
});
