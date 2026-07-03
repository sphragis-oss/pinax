#!/usr/bin/env node
// Validate a profile.json against profile.schema.json: node scripts/validate-profile.mjs <file>
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import Ajv from "ajv";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const file = process.argv[2];
if (!file) {
  console.error("usage: node scripts/validate-profile.mjs <profile.json>");
  process.exit(2);
}

const schema = JSON.parse(readFileSync(resolve(root, "profile.schema.json"), "utf8"));

let data;
try {
  data = JSON.parse(readFileSync(resolve(file), "utf8"));
} catch (err) {
  console.error(`FAIL: not valid JSON: ${err.message}`);
  process.exit(1);
}

const ajv = new Ajv({ allErrors: true, strict: false });
const validate = ajv.compile(schema);
if (!validate(data)) {
  console.error(`FAIL: ${file} does not match profile.schema.json:`);
  for (const e of validate.errors ?? []) {
    console.error(`  ${e.instancePath || "profile"}: ${e.message}`);
  }
  process.exit(1);
}
console.log(`OK: ${file} is a valid pinax profile ("${data.name}", layout=${data.layout})`);
