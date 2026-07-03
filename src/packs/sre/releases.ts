import type { WidgetContext, WidgetSpec } from "../../core/types";
import { parseReleaseScan } from "./parse";
import { scanFilesIn, metaFileLink, ageDays, openExternal } from "./helpers";

export const releasesWidget: WidgetSpec = {
  async render(el: HTMLElement, ctx: WidgetContext): Promise<void> {
    const folderPath = String(ctx.pane.folder ?? "raw/scans/claude-code-releases");
    const files = scanFilesIn(ctx.app, folderPath);
    if (files.length === 0) {
      el.createEl("div", { text: "No scans yet. Run /claude-code-releases or wait for the daily routine.", cls: "cc-empty" });
      return;
    }
    const latest = files[0];
    const meta = metaFileLink(el, latest, ctx);
    const age = ageDays(latest);
    meta.createSpan({ text: age === 0 ? "fresh, today" : `${age}d old`, cls: "cc-muted" });

    const text = await ctx.app.vault.cachedRead(latest);
    const releases = parseReleaseScan(text);
    if (releases.length === 0) {
      el.createEl("div", { text: "Scan exists but no release sections parsed.", cls: "cc-empty" });
      return;
    }
    const list = el.createDiv({ cls: "cc-ccr-list" });
    for (const r of releases) {
      const card = list.createDiv({ cls: "cc-ccr-card" });
      const head = card.createDiv({ cls: "cc-ccr-head" });
      const tagEl = head.createEl("a", { text: r.tag, cls: "cc-link cc-ccr-tag" });
      if (r.url) tagEl.onclick = (e) => { e.preventDefault(); openExternal(r.url ?? ""); };
      if (r.date) head.createSpan({ text: r.date, cls: "cc-ccr-date" });
      if (r.tldr) card.createDiv({ text: r.tldr, cls: "cc-ccr-tldr" });
      if (r.highlights.length > 0) {
        const ul = card.createEl("ul", { cls: "cc-ccr-highlights" });
        for (const h of r.highlights) {
          const li = ul.createEl("li");
          if (h.tag) {
            const tagCls = "cc-ccr-badge cc-ccr-badge-" + h.tag.toLowerCase();
            li.createSpan({ text: h.tag, cls: tagCls });
          }
          li.createSpan({ text: h.text, cls: "cc-ccr-htext" });
        }
      }
    }
  },
};
