import { MarkdownRenderer, TFile, normalizePath } from "obsidian";
import type { WidgetContext, WidgetSpec } from "../types";
import { safeVaultPath } from "../trust";
import { expandVars } from "../template";
import { emptyEl } from "../ui";

export const markdownEmbed: WidgetSpec = {
  defaults: { note: "note.md" },
  async render(el: HTMLElement, ctx: WidgetContext): Promise<void> {
    const raw = expandVars(String(ctx.pane.note ?? ""), ctx.app);
    const path = normalizePath(safeVaultPath(raw));
    const file = ctx.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) {
      emptyEl(el, `Note not found: ${path}`);
      return;
    }
    let content: string;
    try {
      content = await ctx.app.vault.cachedRead(file);
    } catch (err) {
      emptyEl(el, `Read error: ${String(err)}`);
      return;
    }
    const body = el.createDiv({ cls: "px-md" });
    await MarkdownRenderer.render(ctx.app, content, body, file.path, ctx.component);
  },
};
