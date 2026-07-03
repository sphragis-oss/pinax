import type { NoteRecord } from "../types";

export function localDay(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

// Day bucket for a record: dateField frontmatter > YYYY-MM-DD in filename > mtime
export function recordDay(r: NoteRecord, dateField?: string): string | null {
  if (dateField) {
    const v = r.fields[dateField];
    if (v === undefined || v === null) return null;
    const s = String(v);
    const m = s.match(/^\d{4}-\d{2}-\d{2}/);
    if (m) return m[0];
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? null : localDay(d);
  }
  const m = r.name.match(/\d{4}-\d{2}-\d{2}/);
  if (m) return m[0];
  return localDay(new Date(r.mtime));
}
