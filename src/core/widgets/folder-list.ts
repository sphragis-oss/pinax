import type { WidgetContext, WidgetSpec } from "../types";
import { listFolder } from "../vault";
import { expandVars } from "../template";
import { emptyEl } from "../ui";

function agoLabel(mtime: number): string {
  if (mtime === 0) return "empty";
  const days = Math.floor((Date.now() - mtime) / 86400000);
  if (days === 0) return "today";
  if (days === 1) return "1d ago";
  return `${days}d ago`;
}

export const folderList: WidgetSpec = {
  defaults: { folder: "notes" },
  render(el: HTMLElement, ctx: WidgetContext): void {
    const folder = expandVars(String(ctx.pane.folder ?? ""), ctx.app);
    let entries = listFolder(ctx.app, folder);
    if (entries.length === 0) {
      emptyEl(el, `Nothing in ${folder}/ yet.`);
      return;
    }
    const limit = Number(ctx.pane.limit) || 0;
    if (limit > 0) entries = entries.slice(0, limit);
    const list = el.createEl("ul", { cls: "cc-list" });
    for (const entry of entries) {
      const li = list.createEl("li", { cls: "cc-proj-row" });
      const left = li.createSpan({ cls: "cc-proj-left" });
      const link = left.createEl("a", {
        text: entry.isFolder ? entry.name + "/" : entry.name,
        cls: "cc-link cc-proj-name",
      });
      link.onclick = (e) => { e.preventDefault(); ctx.openNote(entry.path); };
      const right = li.createSpan({ cls: "cc-muted" });
      if (entry.isFolder && ctx.pane.showCounts !== false) {
        right.setText(`${entry.fileCount} files · ${agoLabel(entry.mtime)}`);
      } else {
        right.setText(agoLabel(entry.mtime));
      }
    }
  },
};
