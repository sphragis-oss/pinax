import { normalizePath } from "obsidian";
import type { WidgetContext, WidgetSpec } from "../types";
import { safeVaultPath } from "../trust";
import { loadRecords, sourceLabel, RecordSource } from "../source";
import { expandVars } from "../template";
import { recordDay, localDay } from "./record-date";
import { emptyEl } from "../ui";

function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}

function streak(counts: Map<string, number>, today: Date): number {
  let n = 0;
  let cur = counts.has(localDay(today)) ? today : addDays(today, -1);
  while (counts.has(localDay(cur))) {
    n++;
    cur = addDays(cur, -1);
  }
  return n;
}

export const heatmap: WidgetSpec = {
  defaults: { source: { folder: "notes" } },
  async render(el: HTMLElement, ctx: WidgetContext): Promise<void> {
    const source = (ctx.pane.source ?? {}) as RecordSource;
    const folder = typeof source.folder === "string" ? expandVars(source.folder, ctx.app) : "";
    const rows = await loadRecords(ctx.app, source, ctx.pane.recursive === true);
    if (rows.length === 0) {
      emptyEl(el, `No notes in ${sourceLabel(source, ctx.app)} yet.`);
      return;
    }
    const dateField = typeof ctx.pane.dateField === "string" ? ctx.pane.dateField : undefined;
    const counts = new Map<string, number>();
    const newestByDay = new Map<string, string>();
    for (const r of rows) {
      const day = recordDay(r, dateField);
      if (!day) continue;
      counts.set(day, (counts.get(day) ?? 0) + 1);
      if (!newestByDay.has(day)) newestByDay.set(day, r.path);
    }
    const weeks = Math.min(53, Math.max(4, Number(ctx.pane.weeks) || 26));
    const today = new Date();
    const dow = (today.getDay() + 6) % 7;
    const gridStart = addDays(today, -dow - (weeks - 1) * 7);
    const max = Math.max(1, ...counts.values());

    const grid = el.createDiv({ cls: "px-heatmap" });
    for (let w = 0; w < weeks; w++) {
      const colEl = grid.createDiv({ cls: "px-heat-col" });
      for (let d = 0; d < 7; d++) {
        const date = addDays(gridStart, w * 7 + d);
        if (date > today) {
          colEl.createDiv({ cls: "px-heat px-heat-future" });
          continue;
        }
        const key = localDay(date);
        const n = counts.get(key) ?? 0;
        const level = n === 0 ? 0 : Math.ceil((4 * n) / max);
        const cell = colEl.createDiv({ cls: `px-heat px-heat-${level}` });
        cell.title = `${key}: ${n} ${n === 1 ? "note" : "notes"}`;
        const path = newestByDay.get(key);
        if (path) {
          cell.addClass("cc-clickable");
          cell.onclick = () => ctx.openNote(path);
        } else if (!dateField && folder !== "" && ctx.trust.write) {
          cell.title += " (click to create)";
          cell.addClass("cc-clickable");
          cell.onclick = () => {
            void ctx.app.vault
              .create(normalizePath(`${safeVaultPath(folder)}/${key}.md`), `# ${key}\n`)
              .then((f) => { ctx.openNote(f.path); ctx.refresh(); })
              .catch((err) => console.error("pinax: heatmap day-note create failed", err));
          };
        }
      }
    }

    const total = Array.from(counts.values()).reduce((a, b) => a + b, 0);
    const meta = el.createDiv({ cls: "cc-muted px-heat-meta" });
    meta.setText(`${total} notes · ${counts.size} active days · streak ${streak(counts, today)}d`);
  },
};
