import { Menu, Platform } from "obsidian";
import type { NoteRecord, WidgetContext, WidgetSpec } from "../types";
import { loadRecords, sourceLabel, RecordSource } from "../source";
import { paneActions, applySet } from "../mutate";
import { emptyEl } from "../ui";

const NONE = "(none)";

async function moveCard(ctx: WidgetContext, path: string, groupBy: string, value: string): Promise<void> {
  await applySet(ctx.app, path, { [groupBy]: value === NONE ? undefined : value }, "Moved");
  ctx.refresh();
}

export const board: WidgetSpec = {
  defaults: { source: { folder: "notes" }, groupBy: "status" },
  async render(el: HTMLElement, ctx: WidgetContext): Promise<void> {
    const source = (ctx.pane.source ?? {}) as RecordSource;
    const groupBy = String(ctx.pane.groupBy ?? "");
    const rows = await loadRecords(ctx.app, source, ctx.pane.recursive === true);
    if (rows.length === 0) {
      emptyEl(el, `No notes in ${sourceLabel(source, ctx.app)} yet.`);
      return;
    }

    const buckets = new Map<string, NoteRecord[]>();
    const explicit = Array.isArray(ctx.pane.columns) && ctx.pane.columns.length > 0
      ? (ctx.pane.columns as string[])
      : null;
    if (explicit) for (const c of explicit) buckets.set(c, []);
    for (const r of rows) {
      const raw = r.fields[groupBy];
      const key = raw === undefined || raw === null || String(raw) === "" ? NONE : String(raw);
      if (explicit && !buckets.has(key)) continue;
      const bucket = buckets.get(key) ?? [];
      bucket.push(r);
      buckets.set(key, bucket);
    }
    if (!explicit) {
      const keys = Array.from(buckets.keys()).sort((a, b) =>
        a === NONE ? 1 : b === NONE ? -1 : a.localeCompare(b),
      );
      const sorted = new Map<string, NoteRecord[]>();
      for (const k of keys) sorted.set(k, buckets.get(k) ?? []);
      buckets.clear();
      for (const [k, v] of sorted) buckets.set(k, v);
    }

    const cardFields = Array.isArray(ctx.pane.cardFields) ? (ctx.pane.cardFields as string[]) : [];
    const limit = Number(ctx.pane.limit) || 0;
    const boardEl = el.createDiv({ cls: "px-pipeline px-board" });
    const canDrag = ctx.trust.write;
    const actions = ctx.trust.write ? paneActions(ctx.pane) : [];
    for (const [key, items] of buckets) {
      const col = boardEl.createDiv({ cls: "px-pipeline-col" });
      if (canDrag) {
        col.ondragover = (e) => { e.preventDefault(); col.addClass("px-board-dropover"); };
        col.ondragleave = () => col.removeClass("px-board-dropover");
        col.ondrop = (e) => {
          e.preventDefault();
          col.removeClass("px-board-dropover");
          const path = e.dataTransfer?.getData("text/plain") ?? "";
          if (!path) return;
          void moveCard(ctx, path, groupBy, key).catch((err) => console.error("pinax: board move failed", err));
        };
      }
      const head = col.createDiv({ cls: "px-pipeline-head" });
      head.createSpan({ text: key });
      head.createSpan({ text: String(items.length) });
      const shown = limit > 0 ? items.slice(0, limit) : items;
      for (const r of shown) {
        const card = col.createDiv({ cls: "px-pipeline-card cc-clickable" });
        if (canDrag) {
          card.draggable = true;
          card.ondragstart = (e) => e.dataTransfer?.setData("text/plain", r.path);
        }
        // touch screens get no HTML5 drag events, so offer a move menu instead
        if (canDrag && Platform.isMobile) {
          const moveBtn = card.createEl("button", { text: "⇄ move", cls: "px-btn px-action-btn px-board-move" });
          moveBtn.onclick = (e) => {
            e.stopPropagation();
            const menu = new Menu();
            for (const target of buckets.keys()) {
              if (target === key) continue;
              menu.addItem((item) => item.setTitle(target).onClick(() => {
                void moveCard(ctx, r.path, groupBy, target).catch((err) => console.error("pinax: board move failed", err));
              }));
            }
            menu.showAtMouseEvent(e);
          };
        }
        card.createDiv({ text: String(r.fields.name ?? r.name), cls: "px-pipeline-name" });
        for (const f of cardFields) {
          const v = r.fields[f];
          if (v !== undefined && v !== null && String(v) !== "") {
            card.createDiv({ text: String(v), cls: "cc-muted px-pipeline-sub" });
          }
        }
        if (actions.length > 0) {
          const row = card.createDiv({ cls: "px-actions-cell" });
          for (const a of actions) {
            const btn = row.createEl("button", { text: a.label, cls: "px-btn px-action-btn" });
            btn.onclick = (e) => {
              e.stopPropagation();
              void applySet(ctx.app, r.path, a.set)
                .then(() => ctx.refresh())
                .catch((err) => console.error("pinax: action failed", err));
            };
          }
        }
        card.onclick = () => ctx.openNote(r.path);
      }
      if (items.length > shown.length) {
        col.createDiv({ text: `+${items.length - shown.length} more`, cls: "cc-muted px-pipeline-empty" });
      }
      if (items.length === 0) col.createDiv({ text: "-", cls: "cc-muted px-pipeline-empty" });
    }
  },
};
