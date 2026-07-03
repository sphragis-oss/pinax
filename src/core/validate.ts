import Ajv, { ErrorObject } from "ajv";
import schema from "../../profile.schema.json";
import type { Profile } from "./types";

export interface ValidationResult {
  ok: boolean;
  errors: string[];
  profile: Profile | null;
}

export const WIDGET_TYPES = [
  "folder-latest",
  "folder-list",
  "markdown-embed",
  "table",
  "form",
  "command-buttons",
  "iframe",
  "heatmap",
  "board",
  "stat",
  "custom",
] as const;

let compiled: ReturnType<Ajv["compile"]> | null = null;

function validator(): ReturnType<Ajv["compile"]> {
  if (!compiled) {
    const ajv = new Ajv({ allErrors: true, strict: false });
    compiled = ajv.compile(schema as object);
  }
  return compiled;
}

// Collapse ajv's noisy oneOf output into one line per offending pane
function formatErrors(errors: ErrorObject[], data: unknown): string[] {
  const out: string[] = [];
  const paneErrors = new Set<string>();
  for (const e of errors) {
    const paneMatch = e.instancePath.match(/^(\/(?:tabs\/\d+\/)?panes\/\d+)/);
    if (paneMatch) {
      paneErrors.add(paneMatch[1]);
      continue;
    }
    out.push(`${e.instancePath || "profile"}: ${e.message ?? "invalid"}`);
  }
  for (const p of paneErrors) {
    const pane = pointerGet(data, p) as Record<string, unknown> | undefined;
    const t = pane && typeof pane.type === "string" ? pane.type : undefined;
    if (t && !(WIDGET_TYPES as readonly string[]).includes(t)) {
      out.push(`${p}: unknown pane type "${t}" (known: ${WIDGET_TYPES.join(", ")})`);
    } else if (t) {
      out.push(`${p}: invalid config for pane type "${t}" (check required fields and value shapes)`);
    } else {
      out.push(`${p}: pane is missing a "type" field`);
    }
  }
  return out.length > 0 ? out : ["profile does not match the schema"];
}

function pointerGet(data: unknown, pointer: string): unknown {
  let cur: unknown = data;
  for (const seg of pointer.split("/").slice(1)) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return cur;
}

export function validateProfile(data: unknown): ValidationResult {
  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    return { ok: false, errors: ["profile.json must be a JSON object"], profile: null };
  }
  const v = validator();
  const ok = v(data) as boolean;
  if (!ok) {
    return { ok: false, errors: formatErrors(v.errors ?? [], data), profile: null };
  }
  return { ok: true, errors: [], profile: data as unknown as Profile };
}

export function parseProfileJson(text: string): ValidationResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (err) {
    return { ok: false, errors: [`profile.json is not valid JSON: ${String(err)}`], profile: null };
  }
  return validateProfile(data);
}
