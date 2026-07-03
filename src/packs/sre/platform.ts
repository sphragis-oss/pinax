import type { WidgetContext, WidgetSpec } from "../../core/types";
import { parseFrontmatter, parsePlatformScan } from "./parse";
import { scanFilesIn, metaFileLink, ageDays, metricTile } from "./helpers";
import { renderPlatformSection, sectionLabel, ownPane } from "./platform-render";

export const platformWidget: WidgetSpec = {
  async render(el: HTMLElement, ctx: WidgetContext): Promise<void> {
    if (typeof ctx.pane.label === "string") sectionLabel(el, ctx.pane.label);
    const folderPath = String(ctx.pane.folder ?? "raw/scans/platform");
    const files = scanFilesIn(ctx.app, folderPath);
    if (files.length === 0) {
      el.createEl("div", { text: "No platform scans yet. On the work box: claude /platform-state.", cls: "cc-empty" });
      return;
    }
    const latest = files[0];
    const text = await ctx.app.vault.cachedRead(latest);
    const fm = parseFrontmatter(text);

    const meta = metaFileLink(el, latest, ctx);
    const age = ageDays(latest);
    if (age > 1) {
      meta.createSpan({ text: `stale, ${age}d old, re-run on work box`, cls: "cc-jira-stale" });
    } else {
      meta.createSpan({ text: age === 0 ? "fresh, today" : "1d old", cls: "cc-muted" });
    }

    const tiles = el.createDiv({ cls: "cc-metric-row cc-platform-tiles" });
    const stale = Number(fm.terraform_stale_14d) || 0;
    const degraded = Number(fm.k8s_degraded) || 0;
    const clusters = Number(fm.k8s_clusters) || 0;
    metricTile(tiles, "TF OPEN", fm.terraform_open ?? "?", `merged 7d: ${fm.terraform_merged_7d ?? "?"}`);
    metricTile(tiles, "TF STALE", fm.terraform_stale_14d ?? "?", ">14d untouched", stale > 10 ? "warn" : undefined);
    metricTile(tiles, "HELM CHARTS", fm.helm_charts ?? "?", `commits 7d: ${fm.helm_commits_7d ?? "?"}`);
    metricTile(
      tiles,
      "K8S",
      `${Math.max(0, clusters - degraded)}/${clusters || "?"}`,
      degraded > 0 ? `${degraded} degraded` : "all healthy",
      degraded > 0 ? "warn" : undefined,
    );

    const scan = parsePlatformScan(text);
    renderPlatformSection(ownPane(el, "▢ TERRAFORM"), scan.terraform, ["Atlantis"]);
    renderPlatformSection(ownPane(el, "⎈ HELM"), scan.helm);
    renderPlatformSection(ownPane(el, "◆ KUBERNETES"), scan.kubernetes, ["Status"]);

    if (scan.actions.length > 0) {
      const actPane = ownPane(el, "! ACTION ITEMS");
      const ul = actPane.createEl("ul", { cls: "cc-platform-actions" });
      for (const a of scan.actions) ul.createEl("li", { text: a });
    }
  },
};
