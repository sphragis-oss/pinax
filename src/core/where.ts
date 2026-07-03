import type { App } from "obsidian";
import type { NoteRecord } from "./types";
import { expandVars } from "./template";

export interface WhereClause {
  field: string;
  is?: string | number | boolean;
  not?: string | number | boolean;
  above?: number;
  below?: number;
  after?: string;
  before?: string;
}

function fieldValue(r: NoteRecord, field: string): unknown {
  if (field === "name") return r.name;
  if (field === "modified") return r.mtime;
  return r.fields[field];
}

function expanded(v: string | number | boolean, app: App | null): string {
  return typeof v === "string" && app ? expandVars(v, app) : String(v);
}

function matches(r: NoteRecord, c: WhereClause, app: App | null): boolean {
  const v = fieldValue(r, c.field);
  if (c.is !== undefined && String(v ?? "") !== expanded(c.is, app)) return false;
  if (c.not !== undefined && String(v ?? "") === expanded(c.not, app)) return false;
  if (c.above !== undefined && !(Number(v) > c.above)) return false;
  if (c.below !== undefined && !(Number(v) < c.below)) return false;
  if (c.after !== undefined && !(String(v ?? "") > expanded(c.after, app))) return false;
  if (c.before !== undefined && !(String(v ?? "") < expanded(c.before, app))) return false;
  return true;
}

// All clauses must hold (AND). Non-array/empty input filters nothing.
export function applyWhere(rows: NoteRecord[], where: unknown, app: App | null = null): NoteRecord[] {
  if (!Array.isArray(where) || where.length === 0) return rows;
  const clauses = where.filter((c): c is WhereClause =>
    c !== null && typeof c === "object" && typeof (c as WhereClause).field === "string",
  );
  return rows.filter((r) => clauses.every((c) => matches(r, c, app)));
}
