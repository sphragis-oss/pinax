import type { App } from "obsidian";

function dayStr(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${String(d.getDate()).padStart(2, "0")}`;
}

// Local YYYY-MM-DD (daily notes are named by local date, not UTC)
export function todayStr(): string {
  return dayStr(0);
}

// Expands {{today}}, {{today±Nd}} and {{vaultName}} in config strings
export function expandVars(s: string, app: App): string {
  return s
    .replace(/\{\{today([+-]\d{1,4})d\}\}/g, (_, off: string) => dayStr(Number(off)))
    .replace(/\{\{today\}\}/g, dayStr(0))
    .replace(/\{\{vaultName\}\}/g, app.vault.getName());
}
