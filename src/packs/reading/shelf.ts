import type { WidgetContext, WidgetSpec } from "../../core/types";
import { records } from "../../core/vault";

const DEFAULT_SHELVES = ["to-read", "reading", "finished"];

function stars(v: unknown): string {
  const n = Math.max(0, Math.min(5, Math.round(Number(v))));
  return Number.isFinite(Number(v)) && n > 0 ? "★".repeat(n) : "";
}

export const shelfWidget: WidgetSpec = {
  async render(el: HTMLElement, ctx: WidgetContext): Promise<void> {
    const folder = String(ctx.pane.folder ?? "reading/books");
    const statusField = String(ctx.pane.statusField ?? "status");
    const shelves = Array.isArray(ctx.pane.shelves) ? (ctx.pane.shelves as string[]) : DEFAULT_SHELVES;

    const rows = await records(ctx.app, folder);
    if (rows.length === 0) {
      el.createEl("div", { text: `No books in ${folder}/ yet. Add one with the form.`, cls: "cc-empty" });
      return;
    }

    const byShelf = new Map<string, typeof rows>();
    for (const s of shelves) byShelf.set(s, []);
    for (const r of rows) {
      const shelf = String(r.fields[statusField] ?? "").toLowerCase() || "(none)";
      const bucket = byShelf.get(shelf) ?? [];
      bucket.push(r);
      byShelf.set(shelf, bucket);
    }

    const board = el.createDiv({ cls: "px-pipeline" });
    for (const [shelf, items] of byShelf) {
      if (!shelves.includes(shelf) && items.length === 0) continue;
      const col = board.createDiv({ cls: "px-pipeline-col" });
      const head = col.createDiv({ cls: "px-pipeline-head" });
      head.createSpan({ text: shelf, cls: "px-pipeline-stage" });
      head.createSpan({ text: String(items.length), cls: "cc-scan-section-count" });
      for (const r of items) {
        const card = col.createDiv({ cls: "px-pipeline-card cc-clickable" });
        card.createDiv({ text: String(r.fields.name ?? r.name), cls: "px-pipeline-name" });
        const sub = [r.fields.author ? String(r.fields.author) : "", stars(r.fields.rating)].filter(Boolean).join(" · ");
        if (sub) card.createDiv({ text: sub, cls: "cc-muted px-pipeline-sub" });
        card.onclick = () => ctx.openNote(r.path);
      }
      if (items.length === 0) col.createDiv({ text: "-", cls: "cc-muted px-pipeline-empty" });
    }
  },
};
