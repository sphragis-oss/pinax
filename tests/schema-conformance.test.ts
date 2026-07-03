import { test } from "node:test";
import assert from "node:assert/strict";
import Ajv from "ajv";
import schema from "../profile.schema.json";
import sreProfile from "../profiles/sre/profile.json";
import readingProfile from "../profiles/reading/profile.json";
import generatedProfile from "./fixtures/generated-profile.json";

const ajv = new Ajv({ allErrors: true, strict: false });
const validate = ajv.compile(schema as object);

const cases: [string, unknown][] = [
  ["shipped sre profile", sreProfile],
  ["shipped reading profile", readingProfile],
  ["LLM-generated sample profile", generatedProfile],
];

for (const [label, profile] of cases) {
  test(`schema-conformance: ${label}`, () => {
    const ok = validate(profile);
    const errs = (validate.errors ?? []).map((e) => `${e.instancePath}: ${e.message}`).join("; ");
    assert.equal(ok, true, errs);
  });
}

test("schema rejects a profile with an invented widget type", () => {
  const ok = validate({ name: "x", layout: "grid", panes: [{ type: "kanban" }] });
  assert.equal(ok, false);
});

test("schema is itself valid JSON Schema draft-07", () => {
  assert.equal((schema as { $schema?: string }).$schema, "http://json-schema.org/draft-07/schema#");
  assert.doesNotThrow(() => new Ajv({ strict: false }).compile(schema as object));
});
