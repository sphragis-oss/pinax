import type { NoteRecord, WidgetContext, WidgetSpec } from "../types";
import { loadRecords, sourceLabel, RecordSource } from "../source";
import { paneActions, applySet } from "../mutate";
import { emptyEl } from "../ui";

interface SortState { by: string; dir: "asc" | "desc"; }

function cellValue(r: NoteRecord, col: string): unknown {
  if (col === "name") return r.name;
  if (col === "modified") return r.mtime;
  return r.fields[col];
}

function cellText(r: NoteRecord, col: string): string {
  const v = cellValue(r, col);
  if (v === undefined || v === null) return "";
  if (col === "modified") return new Date(Number(v)).toISOString().slice(0, 10);
  if (Array.isArray(v)) return v.map(String).join(", ");
  return String(v);
}

function compare(a: NoteRecord, b: NoteRecord, sort: SortState): number {
  const va = cellValue(a, sort.by);
  const vb = cellValue(b, sort.by);
  let n: number;
  if (typeof va === "number" && typeof vb === "number") n = va - vb;
  else n = String(va ?? "").localeCompare(String(vb ?? ""), undefined, { numeric: true });
  return sort.dir === "desc" ? -n : n;
}

function defaultColumns(rows: NoteRecord[]): string[] {
  const keys = new Set<string>();
  for (const r of rows) for (const k of Object.keys(r.fields)) keys.add(k);
  return ["name", ...Array.from(keys).slice(0, 5)];
}

export const table: WidgetSpec = {
  defaults: { source: { folder: "notes" }, filter: true },
  async render(el: HTMLElement, ctx: WidgetContext): Promise<void> {
    const source = (ctx.pane.source ?? {}) as RecordSource;
    let rows = await loadRecords(ctx.app, source, ctx.pane.recursive === true);
    if (rows.length === 0) {
      emptyEl(el, `No notes in ${sourceLabel(source, ctx.app)} yet.`);
      return;
    }
    const limit = Number(ctx.pane.limit) || 0;
    if (limit > 0) rows = rows.slice(0, limit);
    const pageSize = Number(ctx.pane.pageSize) || 100;
    let visible = pageSize;

    const columns = Array.isArray(ctx.pane.columns) && ctx.pane.columns.length > 0
      ? (ctx.pane.columns as string[])
      : defaultColumns(rows);

    const cfgSort = (ctx.pane.sort ?? null) as { by?: string; dir?: string } | null;
    let sort: SortState | null = cfgSort && cfgSort.by
      ? { by: String(cfgSort.by), dir: cfgSort.dir === "desc" ? "desc" : "asc" }
      : null;
    let query = "";

    if (ctx.pane.filter !== false) {
      const controls = el.createDiv({ cls: "cc-pane-controls" });
      const input = controls.createEl("input", { cls: "cc-filter-input" });
      input.placeholder = "filter rows…";
      input.oninput = () => { query = input.value.toLowerCase(); visible = pageSize; draw(); };
    }

    const wrap = el.createDiv({ cls: "px-table-wrap" });

    const draw = (): void => {
      wrap.empty();
      let shown = rows;
      if (query) {
        shown = rows.filter((r) => columns.some((c) => cellText(r, c).toLowerCase().includes(query)));
      }
      if (sort) shown = [...shown].sort((a, b) => compare(a, b, sort!));
      if (shown.length === 0) {
        emptyEl(wrap, "no rows match");
        return;
      }
      const actions = ctx.trust.write ? paneActions(ctx.pane) : [];
      const tbl = wrap.createEl("table", { cls: "cc-platform-table px-table" });
      const headRow = tbl.createEl("thead").createEl("tr");
      for (const col of columns) {
        const th = headRow.createEl("th", { text: col, cls: "px-th-sortable" });
        if (sort?.by === col) {
          th.createSpan({ text: sort.dir === "asc" ? " ↑" : " ↓", cls: "px-sort-arrow" });
          th.setAttribute("aria-sort", sort.dir === "asc" ? "ascending" : "descending");
        }
        th.onclick = () => {
          sort = sort?.by === col && sort.dir === "asc"
            ? { by: col, dir: "desc" }
            : { by: col, dir: "asc" };
          draw();
        };
      }
      if (actions.length > 0) headRow.createEl("th", { text: "" });
      const tbody = tbl.createEl("tbody");
      for (const r of shown.slice(0, visible)) {
        const tr = tbody.createEl("tr", { cls: "px-row-clickable" });
        tr.onclick = () => ctx.openNote(r.path);
        for (const col of columns) tr.createEl("td", { text: cellText(r, col) });
        if (actions.length > 0) {
          const td = tr.createEl("td", { cls: "px-actions-cell" });
          for (const a of actions) {
            const btn = td.createEl("button", { text: a.label, cls: "px-btn px-action-btn" });
            btn.onclick = (e) => {
              e.stopPropagation();
              void applySet(ctx.app, r.path, a.set)
                .then(() => ctx.refresh())
                .catch((err) => console.error("pinax: action failed", err));
            };
          }
        }
      }
      if (shown.length > visible) {
        const more = wrap.createEl("button", {
          text: `Show ${Math.min(pageSize, shown.length - visible)} more (${shown.length - visible} hidden)`,
          cls: "px-btn px-table-more",
        });
        more.onclick = () => { visible += pageSize; draw(); };
      }
    };
    draw();
  },
};
