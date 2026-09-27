import type { NoteRecord } from "../types";

export function localDay(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

// per-day series for the last `days` days ending today, missing days are 0
export function daySeries(perDay: Map<string, number>, days: number, today: Date): number[] {
  const points: number[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    points.push(perDay.get(localDay(d)) ?? 0);
  }
  return points;
}

// total of the current window minus the total of the window before it
export function windowDelta(perDay: Map<string, number>, days: number, today: Date): number {
  const prevEnd = new Date(today);
  prevEnd.setDate(prevEnd.getDate() - days);
  const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0);
  return sum(daySeries(perDay, days, today)) - sum(daySeries(perDay, days, prevEnd));
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
