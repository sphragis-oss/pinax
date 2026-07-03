import type { WidgetContext, WidgetSpec } from "../../core/types";
import { parseScan } from "./parse";
import { scanFilesIn, metaFileLink, openExternal } from "./helpers";

export const clotributorWidget: WidgetSpec = {
  async render(el: HTMLElement, ctx: WidgetContext): Promise<void> {
    const folderPath = String(ctx.pane.folder ?? "raw/scans/clotributor");
    const files = scanFilesIn(ctx.app, folderPath);
    if (files.length === 0) {
      el.createEl("div", { text: "No scans yet. Run /clotributor-radar.", cls: "cc-empty" });
      return;
    }
    const latest = files[0];
    const meta = metaFileLink(el, latest, ctx);

    const text = await ctx.app.vault.cachedRead(latest);
    const sections = parseScan(text);
    const tableSection = sections.find((s) => s.kind === "table" && s.rows.length > 0);
    if (!tableSection) {
      el.createEl("div", { text: "No matching issues in the latest scan.", cls: "cc-empty" });
      return;
    }
    meta.createSpan({ text: `${tableSection.rows.length} candidates`, cls: "cc-muted" });

    const list = el.createEl("ul", { cls: "cc-clot-list" });
    for (const r of tableSection.rows) {
      const li = list.createEl("li", { cls: "cc-clot-row" });
      li.createSpan({ text: r.rank, cls: "cc-clot-rank" });
      const projEl = li.createEl("a", { text: r.repo, cls: "cc-link cc-clot-project" });
      if (r.url) projEl.onclick = (e) => { e.preventDefault(); openExternal(r.url ?? ""); };
      // Table shape: # | Project (linked) | Issue (linked) | Stars | Age; parseTableRow maps Issue -> stars col
      const issueRaw = r.stars;
      const issueMatch = issueRaw.match(/^\[([^\]]+)\]\(([^)]+)\)/);
      const issueText = issueMatch ? issueMatch[1] : issueRaw;
      const issueUrl = issueMatch ? issueMatch[2] : null;
      const issueEl = li.createEl("a", { text: issueText, cls: "cc-link cc-clot-issue" });
      if (issueUrl) issueEl.onclick = (e) => { e.preventDefault(); openExternal(issueUrl); };
      li.createSpan({ text: "★" + r.lang, cls: "cc-clot-stars" });
      li.createSpan({ text: r.desc, cls: "cc-muted cc-clot-age" });
    }
  },
};
