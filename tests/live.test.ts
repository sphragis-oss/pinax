import { test } from "node:test";
import assert from "node:assert/strict";
import type { App } from "obsidian";
import { buildMatcher } from "../src/core/live";
import { todayStr } from "../src/core/template";
import type { Profile } from "../src/core/types";

const app = { vault: { getName: () => "v" } } as unknown as App;

test("matcher: folder sources match the folder and its subtree only", () => {
  const profile: Profile = {
    name: "t", layout: "grid",
    panes: [
      { type: "table", source: { folder: "tasks" } },
      { type: "folder-list", folder: "projects" },
    ],
  };
  const m = buildMatcher(profile, app);
  assert.equal(m("tasks/a.md"), true);
  assert.equal(m("tasks/sub/b.md"), true);
  assert.equal(m("projects/x.md"), true);
  assert.equal(m("tasksish/a.md"), false);
  assert.equal(m("other/x.md"), false);
});

test("matcher: markdown-embed note matches exactly, with token expansion", () => {
  const profile: Profile = {
    name: "t", layout: "grid",
    panes: [{ type: "markdown-embed", note: "daily/{{today}}.md" }],
  };
  const m = buildMatcher(profile, app);
  assert.equal(m(`daily/${todayStr()}.md`), true);
  assert.equal(m("daily/2020-01-01.md"), false);
});

test("matcher: tag sources and custom panes match everything", () => {
  const tagged: Profile = { name: "t", layout: "grid", panes: [{ type: "stat", source: { tags: ["#x"] } }] };
  assert.equal(buildMatcher(tagged, app)("anywhere/note.md"), true);
  const custom: Profile = { name: "t", layout: "grid", panes: [{ type: "custom", widget: "a.b" }] };
  assert.equal(buildMatcher(custom, app)("anywhere/note.md"), true);
});

test("matcher: tabs layout collects panes from every tab", () => {
  const profile: Profile = {
    name: "t", layout: "tabs",
    tabs: [
      { id: "a", label: "A", panes: [{ type: "folder-list", folder: "one" }] },
      { id: "b", label: "B", panes: [{ type: "table", source: { folder: "two" } }] },
    ],
  };
  const m = buildMatcher(profile, app);
  assert.equal(m("one/n.md"), true);
  assert.equal(m("two/n.md"), true);
  assert.equal(m("three/n.md"), false);
});
