import { localDay } from "../../core/widgets/record-date";

export interface SelectableTask {
  done: boolean;
  hasCheckbox: boolean;
  isDaily: boolean;
  day: string;
  path: string;
  line: number;
}

// YYYY-MM-DD from the file name, else the file's mtime
export function fileDay(name: string, mtime: number): string {
  const m = name.match(/\d{4}-\d{2}-\d{2}/);
  return m ? m[0] : localDay(new Date(mtime));
}

export function ageDays(day: string, today: Date): number {
  const [y, m, d] = day.split("-").map(Number);
  const start = new Date(y, m - 1, d).getTime();
  const now = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  return Math.max(0, Math.floor((now - start) / 86400000));
}

export function ageLabel(days: number): string {
  if (days < 1) return "today";
  if (days < 14) return `${days}d`;
  if (days < 60) return `${Math.round(days / 7)}w`;
  return `${Math.round(days / 30)}mo`;
}

// open checkboxes anywhere, plain bullets only from the newest daily note; newest first, stale split off
export function selectTasks<T extends SelectableTask>(all: T[], today: Date, staleDays: number): { fresh: T[]; stale: T[] } {
  let newestDaily = "";
  for (const t of all) if (t.isDaily && t.day > newestDaily) newestDaily = t.day;
  const open = all
    .filter((t) => !t.done && (t.hasCheckbox || (t.isDaily && t.day === newestDaily)))
    .sort((a, b) => b.day.localeCompare(a.day) || a.path.localeCompare(b.path) || a.line - b.line);
  const fresh: T[] = [];
  const stale: T[] = [];
  for (const t of open) (ageDays(t.day, today) > staleDays ? stale : fresh).push(t);
  return { fresh, stale };
}
