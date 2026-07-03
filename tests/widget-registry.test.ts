import { test } from "node:test";
import assert from "node:assert/strict";
import { WidgetRegistry } from "../src/core/registry";

const spec = { render: () => {} };

test("register + get + unregister round-trip", () => {
  const reg = new WidgetRegistry();
  reg.register("demo.hello", spec);
  assert.ok(reg.get("demo.hello"));
  assert.equal(reg.has("demo.hello"), true);
  reg.unregister("demo.hello");
  assert.equal(reg.get("demo.hello"), undefined);
});

test("unknown id resolves to undefined, does not throw", () => {
  const reg = new WidgetRegistry();
  assert.equal(reg.get("no.such.widget"), undefined);
  assert.equal(reg.has("no.such.widget"), false);
});

test("invalid ids are rejected", () => {
  const reg = new WidgetRegistry();
  for (const bad of ["", "nodots", "UPPER.case", ".leading", "trailing.", "sp ace.x"]) {
    assert.throws(() => reg.register(bad, spec), /invalid widget id/, `should reject "${bad}"`);
  }
});

test("spec without render is rejected", () => {
  const reg = new WidgetRegistry();
  assert.throws(() => reg.register("a.b", {} as never), /render/);
});

test("built-ins cannot be overwritten or unregistered", () => {
  const reg = new WidgetRegistry();
  reg.registerBuiltin("table", spec);
  assert.throws(() => reg.register("table", spec));
  assert.throws(() => reg.unregister("table"), /built-in/);
  assert.equal(reg.isBuiltin("table"), true);
});

test("onChanged fires on register and unregister, disposer works", () => {
  const reg = new WidgetRegistry();
  let calls = 0;
  const dispose = reg.onChanged(() => calls++);
  reg.register("a.b", spec);
  reg.unregister("a.b");
  assert.equal(calls, 2);
  dispose();
  reg.register("c.d", spec);
  assert.equal(calls, 2);
});

test("list separates custom from builtins", () => {
  const reg = new WidgetRegistry();
  reg.registerBuiltin("table", spec);
  reg.register("a.b", spec);
  assert.deepEqual(reg.list(), ["a.b", "table"]);
  assert.deepEqual(reg.listBuiltins(), ["table"]);
});
