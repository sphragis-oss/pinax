import type { App } from "obsidian";
import type { NoteRecord } from "./types";
import { records, recordsByTag } from "./vault";
import { expandVars } from "./template";
import { applyWhere } from "./where";

export interface RecordSource {
  folder?: string;
  tags?: unknown;
  where?: unknown;
}

export function sourceLabel(source: RecordSource, app: App): string {
  if (typeof source.folder === "string") return `${expandVars(source.folder, app)}/`;
  if (Array.isArray(source.tags)) return source.tags.map(String).join(" ");
  return "(source)";
}

export async function loadRecords(app: App, source: RecordSource, recursive: boolean): Promise<NoteRecord[]> {
  const rows = Array.isArray(source.tags) && source.tags.length > 0
    ? await recordsByTag(app, source.tags.map(String))
    : await records(app, expandVars(String(source.folder ?? ""), app), recursive);
  return applyWhere(rows, source.where, app);
}
