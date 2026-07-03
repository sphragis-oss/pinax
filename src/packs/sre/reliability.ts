import type { WidgetContext, WidgetSpec } from "../../core/types";
import { parseFrontmatter, parseSectionedScan, findSectionByPrefix } from "./parse";
import { scanFilesIn, metaFileLink, ageDays, metricTile, openExternal } from "./helpers";
import { renderPlatformSection, sectionLabel, ownPane } from "./platform-render";

export const reliabilityWidget: WidgetSpec = {
  async render(el: HTMLElement, ctx: WidgetContext): Promise<void> {
    if (typeof ctx.pane.label === "string") sectionLabel(el, ctx.pane.label);
    const folderPath = String(ctx.pane.folder ?? "raw/scans/reliability");
    const files = scanFilesIn(ctx.app, folderPath);
    if (files.length === 0) {
      el.createEl("div", { text: "No reliability scans yet. On the work box: claude /reliability-state.", cls: "cc-empty" });
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
    if (fm.dashboard_url) {
      const ddLink = meta.createEl("a", { text: "↗ Datadog dashboard", cls: "cc-link cc-muted" });
      ddLink.setAttr("href", fm.dashboard_url);
      ddLink.onclick = (e) => {
        e.preventDefault();
        openExternal(fm.dashboard_url);
      };
    }

    const sla = parseFloat(fm.general_sla_7d || "0");
    const slaVariant: "warn" | undefined = sla < 99.5 ? "warn" : undefined;
    const slosBreached = Number(fm.slos_breached) || 0;
    const slosTotal = Number(fm.slos_total) || 0;
    const slosHealthy = Number(fm.slos_healthy) || 0;
    const below999 = Number(fm.services_below_999) || 0;
    const below99 = Number(fm.services_below_99) || 0;

    const tiles = el.createDiv({ cls: "cc-metric-row cc-platform-tiles" });
    metricTile(tiles, "GENERAL SLA (7D)", fm.general_sla_7d ? `${fm.general_sla_7d}%` : "?", `${fm.services_tracked ?? "?"} services tracked`, slaVariant);
    metricTile(tiles, "SLOS", `${slosHealthy}/${slosTotal}`, slosBreached > 0 ? `${slosBreached} breached` : "all healthy", slosBreached > 0 ? "warn" : undefined);
    metricTile(tiles, "<99.9% SLA", String(below999), "services", below999 > 3 ? "warn" : undefined);
    metricTile(tiles, "<99.0% SLA", String(below99), "services", below99 > 0 ? "warn" : undefined);

    const parsed = parseSectionedScan(text);
    const overview = findSectionByPrefix(parsed, "overview");
    if (overview && overview.tables.length > 0) {
      renderPlatformSection(ownPane(el, "◐ OVERVIEW"), overview);
    }
    const slosSec = findSectionByPrefix(parsed, "slos");
    if (slosSec && slosSec.tables.length > 0) {
      renderPlatformSection(ownPane(el, "● SLOS"), slosSec, ["Status"]);
    }
    const appsSec = findSectionByPrefix(parsed, "sla per app");
    if (appsSec && appsSec.tables.length > 0) {
      renderPlatformSection(ownPane(el, "▸ SLA PER APP (7D, WORST FIRST)"), appsSec);
    }
    if (parsed.actions.length > 0) {
      const actPane = ownPane(el, "! ACTION ITEMS");
      const ul = actPane.createEl("ul", { cls: "cc-platform-actions" });
      for (const a of parsed.actions) ul.createEl("li", { text: a });
    }
  },
};
