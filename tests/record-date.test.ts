import { test } from "node:test";
import assert from "node:assert/strict";
import { daySeries, windowDelta, localDay } from "../src/core/widgets/record-date";

const today = new Date(2026, 8, 27);

// [daysAgo, count] pairs into the per-day map the stat widget builds
function perDay(entries: [number, number][]): Map<string, number> {
  const m = new Map<string, number>();
  for (const [ago, n] of entries) {
    const d = new Date(today);
    d.setDate(d.getDate() - ago);
    m.set(localDay(d), n);
  }
  return m;
}

test("daySeries: oldest first, ends today, missing days are zero", () => {
  assert.deepEqual(daySeries(perDay([[0, 2], [2, 5]]), 3, today), [5, 0, 2]);
});

test("windowDelta: current window minus the one before it", () => {
  assert.equal(windowDelta(perDay([[0, 5], [9, 2]]), 7, today), 3);
  assert.equal(windowDelta(perDay([[0, 3], [1, 1], [7, 2], [8, 2]]), 7, today), 0);
  assert.equal(windowDelta(perDay([[3, 1], [10, 4]]), 7, today), -3);
});

test("windowDelta: days beyond the previous window are ignored", () => {
  assert.equal(windowDelta(perDay([[0, 1], [14, 100]]), 7, today), 1);
});
