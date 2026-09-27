import { test } from "node:test";
import assert from "node:assert/strict";
import { ageDays, ageLabel, fileDay, selectTasks } from "../src/packs/sre/tasks-select";

const today = new Date(2026, 8, 27);

function t(day: string, over: Partial<Parameters<typeof selectTasks>[0][number]> = {}) {
  return { done: false, hasCheckbox: true, isDaily: false, day, path: `p/${day}.md`, line: 1, ...over };
}

test("fileDay: date in the name wins over mtime", () => {
  assert.equal(fileDay("2026-09-22-standup.md", 0), "2026-09-22");
  assert.equal(fileDay("README.md", new Date(2026, 8, 27, 10).getTime()), "2026-09-27");
});

test("ageDays and ageLabel", () => {
  assert.equal(ageDays("2026-09-27", today), 0);
  assert.equal(ageDays("2026-09-20", today), 7);
  assert.equal(ageLabel(0), "today");
  assert.equal(ageLabel(7), "7d");
  assert.equal(ageLabel(21), "3w");
  assert.equal(ageLabel(90), "3mo");
});

test("selectTasks: done items drop, newest first, stale split by age", () => {
  const { fresh, stale } = selectTasks([t("2026-09-01"), t("2026-09-25"), t("2026-05-05"), t("2026-09-20", { done: true })], today, 30);
  assert.deepEqual(fresh.map((x) => x.day), ["2026-09-25", "2026-09-01"]);
  assert.deepEqual(stale.map((x) => x.day), ["2026-05-05"]);
});

test("selectTasks: plain bullets count only from the newest daily note", () => {
  const all = [
    t("2026-09-22", { isDaily: true, hasCheckbox: false }),
    t("2026-09-08", { isDaily: true, hasCheckbox: false }),
    t("2026-09-08", { isDaily: true, hasCheckbox: true, line: 9 }),
    t("2026-09-10", { hasCheckbox: false }),
  ];
  const { fresh, stale } = selectTasks(all, today, 30);
  assert.deepEqual(fresh.map((x) => [x.day, x.hasCheckbox]), [["2026-09-22", false], ["2026-09-08", true]]);
  assert.equal(stale.length, 0);
});
