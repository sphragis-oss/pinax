import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnCandidates, terminalChoices } from "../src/core/terminal-apps";

test("explicit choice maps to its launcher", () => {
  assert.deepEqual(spawnCandidates("mac", "iterm"), [{ cmd: "open", args: ["-a", "iTerm"] }]);
  assert.deepEqual(spawnCandidates("mac", "ghostty"), [{ cmd: "open", args: ["-a", "Ghostty"] }]);
  assert.deepEqual(spawnCandidates("win", "wt"), [{ cmd: "cmd", args: ["/c", "start", "", "wt"] }]);
  assert.deepEqual(spawnCandidates("linux", "kitty"), [{ cmd: "kitty", args: [] }]);
});

test("auto uses the platform default chain", () => {
  assert.deepEqual(spawnCandidates("mac", "auto"), [{ cmd: "open", args: ["-a", "Terminal"] }]);
  assert.deepEqual(spawnCandidates("win", "auto"), [{ cmd: "cmd", args: ["/c", "start", "", "cmd"] }]);
  const linux = spawnCandidates("linux", "auto");
  assert.equal(linux[0].cmd, "x-terminal-emulator");
  assert.ok(linux.length >= 2);
});

test("mac auto prefers detected terminals, Terminal.app last", () => {
  const detect = (app: string) => app === "Ghostty" || app === "iTerm";
  assert.deepEqual(spawnCandidates("mac", "auto", detect), [
    { cmd: "open", args: ["-a", "iTerm"] },
    { cmd: "open", args: ["-a", "Ghostty"] },
    { cmd: "open", args: ["-a", "Terminal"] },
  ]);
  assert.deepEqual(spawnCandidates("mac", "auto", () => false), [{ cmd: "open", args: ["-a", "Terminal"] }]);
});

test("unknown stored id degrades to the auto chain", () => {
  assert.deepEqual(spawnCandidates("mac", "no-such-terminal"), spawnCandidates("mac", "auto"));
  assert.deepEqual(spawnCandidates("win", "iterm"), spawnCandidates("win", "auto"));
});

test("choice ids are unique per platform and never collide with auto/copy", () => {
  for (const p of ["mac", "win", "linux"] as const) {
    const ids = terminalChoices(p).map((c) => c.id);
    assert.equal(new Set(ids).size, ids.length);
    assert.ok(!ids.includes("auto") && !ids.includes("copy"));
  }
});
