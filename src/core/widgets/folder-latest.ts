import { MarkdownRenderer } from "obsidian";
import type { WidgetContext, WidgetSpec } from "../types";
import { latestInFolder } from "../vault";
import { expandVars } from "../template";
import { emptyEl } from "../ui";

function ageLabel(mtime: number): string {
  const hr = Math.floor((Date.now() - mtime) / 3600000);
  if (hr < 1) return "fresh";
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

export const folderLatest: WidgetSpec = {
  defaults: { folder: "notes" },
  async render(el: HTMLElement, ctx: WidgetContext): Promise<void> {
    const folder = expandVars(String(ctx.pane.folder ?? ""), ctx.app);
    const file = latestInFolder(ctx.app, folder);
    if (!file) {
      emptyEl(el, `No notes in ${folder}/ yet.`);
      return;
    }
    if (ctx.pane.showMeta !== false) {
      const meta = el.createDiv({ cls: "cc-meta" });
      const link = meta.createEl("a", { text: file.name, cls: "cc-link" });
      link.onclick = (e) => { e.preventDefault(); ctx.openNote(file.path); };
      meta.createSpan({ text: ageLabel(file.stat.mtime), cls: "cc-muted" });
    }
    let content: string;
    try {
      content = await ctx.app.vault.cachedRead(file);
    } catch (err) {
      emptyEl(el, `Read error: ${String(err)}`);
      return;
    }
    const body = el.createDiv({ cls: "px-md" });
    if (ctx.pane.render === "text") {
      body.createEl("pre", { text: content.slice(0, 4000), cls: "cc-content" });
    } else {
      await MarkdownRenderer.render(ctx.app, content, body, file.path, ctx.component);
    }
  },
};
