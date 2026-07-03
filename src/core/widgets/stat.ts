import type { NoteRecord, WidgetContext, WidgetSpec } from "../types";
import { loadRecords, sourceLabel, RecordSource } from "../source";
import { recordDay, localDay } from "./record-date";
import { emptyEl } from "../ui";

type Agg = "count" | "sum" | "avg" | "min" | "max";

function numbers(rows: NoteRecord[], field: string): number[] {
  return rows.map((r) => Number(r.fields[field])).filter((n) => Number.isFinite(n));
}

function aggregate(rows: NoteRecord[], agg: Agg, field?: string): number | null {
  if (agg === "count") return rows.length;
  if (!field) return null;
  const ns = numbers(rows, field);
  if (ns.length === 0) return null;
  const sum = ns.reduce((a, b) => a + b, 0);
  if (agg === "sum") return sum;
  if (agg === "avg") return sum / ns.length;
  if (agg === "min") return Math.min(...ns);
  return Math.max(...ns);
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
}

function sparkline(el: HTMLElement, points: number[]): void {
  const w = 120;
  const h = 28;
  const max = Math.max(1, ...points);
  const step = points.length > 1 ? w / (points.length - 1) : w;
  const coords = points
    .map((v, i) => `${(i * step).toFixed(1)},${(h - 2 - (v / max) * (h - 4)).toFixed(1)}`)
    .join(" ");
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
  svg.classList.add("px-stat-spark");
  const line = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
  line.setAttribute("points", coords);
  line.setAttribute("fill", "none");
  line.setAttribute("stroke", "currentColor");
  line.setAttribute("stroke-width", "1.5");
  svg.appendChild(line);
  el.appendChild(svg);
}

export const stat: WidgetSpec = {
  defaults: { source: { folder: "notes" }, agg: "count" },
  async render(el: HTMLElement, ctx: WidgetContext): Promise<void> {
    const source = (ctx.pane.source ?? {}) as RecordSource;
    const rows = await loadRecords(ctx.app, source, ctx.pane.recursive === true);
    if (rows.length === 0) {
      emptyEl(el, `No notes in ${sourceLabel(source, ctx.app)} yet.`);
      return;
    }
    const agg = (["count", "sum", "avg", "min", "max"].includes(String(ctx.pane.agg))
      ? ctx.pane.agg
      : "count") as Agg;
    const field = typeof ctx.pane.field === "string" ? ctx.pane.field : undefined;
    const value = aggregate(rows, agg, field);

    const box = el.createDiv({ cls: "px-stat" });
    const warn = (ctx.pane.warn ?? null) as { above?: number; below?: number } | null;
    if (warn && value !== null) {
      const hit = (warn.above !== undefined && value > warn.above) || (warn.below !== undefined && value < warn.below);
      if (hit) box.addClass("px-stat-warn");
    }
    box.createDiv({ text: value === null ? "n/a" : fmt(value), cls: "px-stat-value cc-num" });
    box.createDiv({
      text: String(ctx.pane.label ?? (agg === "count" ? "notes" : `${agg} ${field ?? ""}`.trim())),
      cls: "px-stat-label",
    });

    if (ctx.pane.sparkline === true) {
      const days = Math.min(365, Math.max(7, Number(ctx.pane.days) || 30));
      const dateField = typeof ctx.pane.dateField === "string" ? ctx.pane.dateField : undefined;
      const perDay = new Map<string, number>();
      for (const r of rows) {
        const day = recordDay(r, dateField);
        if (!day) continue;
        const inc = agg === "count" ? 1 : Number(field ? r.fields[field] : NaN);
        if (!Number.isFinite(inc)) continue;
        perDay.set(day, (perDay.get(day) ?? 0) + inc);
      }
      const points: number[] = [];
      const today = new Date();
      for (let i = days - 1; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        points.push(perDay.get(localDay(d)) ?? 0);
      }
      if (points.some((p) => p > 0)) sparkline(box, points);
    }
  },
};
