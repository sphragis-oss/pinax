import { Notice, Platform, TFile } from "obsidian";
import type { WidgetContext, WidgetSpec } from "../../core/types";
import { runCommand } from "../../core/terminal";
import { nodeRequire, NodeFs } from "../../core/platform";
import { parseScan, parseFrontmatter, parseMcpAudit } from "./parse";
import { scanFilesIn } from "./helpers";
import { checkOllama, checkFirecrawl } from "./probes";

interface Alert { level: "warn" | "crit"; text: string; actionLabel?: string; action?: () => void; }

function vaultBasePath(ctx: WidgetContext): string | null {
  const adapter = ctx.app.vault.adapter as { getBasePath?: () => string };
  return typeof adapter.getBasePath === "function" ? adapter.getBasePath() : null;
}

export const alertsWidget: WidgetSpec = {
  async render(el: HTMLElement, ctx: WidgetContext): Promise<void> {
    const bar = el.createDiv({ cls: "cc-alert-bar" });
    const alerts: Alert[] = [];

    const guardedRun = (cmd: string): void => {
      if (!ctx.trust.command) {
        new Notice('pinax: enable "Command buttons" in Settings → Pinax to use alert actions.');
        return;
      }
      void runCommand(ctx.app, cmd);
    };
    const latestOf = (folderPath: string): TFile | null => scanFilesIn(ctx.app, folderPath)[0] ?? null;

    // 1) stale scans
    for (const s of [
      { label: "CNCF radar", path: "raw/scans", cmd: "claude /morning-trend-scan" },
      { label: "GH trending", path: "raw/scans/github-trending", cmd: "claude /github-trending-radar" },
      { label: "CLOTributor", path: "raw/scans/clotributor", cmd: "claude /clotributor-radar" },
      { label: "Jira", path: "raw/scans/jira", cmd: "claude /jira-mytickets" },
    ]) {
      const latest = latestOf(s.path);
      if (!latest) continue;
      const days = Math.floor((Date.now() - latest.stat.mtime) / 86_400_000);
      if (days >= 1) {
        alerts.push({ level: "warn", text: `${s.label} ${days}d stale`, actionLabel: "▶ run", action: () => guardedRun(s.cmd) });
      }
    }

    // 2) high CVEs today
    const cncf = latestOf("raw/scans");
    if (cncf) {
      const cves = parseScan(await ctx.app.vault.cachedRead(cncf)).filter((s) => s.kind === "cve").reduce((n, s) => n + s.bullets.length, 0);
      if (cves > 0) alerts.push({ level: "crit", text: `${cves} high+ CVEs today`, actionLabel: "open", action: () => ctx.openNote(cncf.path) });
    }

    // 3) failed MCP servers
    const mcp = latestOf("raw/scans/mcp-audit");
    if (mcp) {
      const failed = parseMcpAudit(await ctx.app.vault.cachedRead(mcp)).filter((e) => e.status === "failed").length;
      if (failed > 0) alerts.push({ level: "warn", text: `${failed} MCP server${failed > 1 ? "s" : ""} failed`, actionLabel: "open", action: () => ctx.openNote(mcp.path) });
    }

    // 4) reliability breaches (work box)
    const rel = latestOf("raw/scans/reliability");
    if (rel) {
      const fm = parseFrontmatter(await ctx.app.vault.cachedRead(rel));
      const below999 = Number(fm.services_below_999) || 0;
      const breached = Number(fm.slos_breached) || 0;
      if (breached > 0) alerts.push({ level: "crit", text: `${breached} SLOs breached`, actionLabel: "open", action: () => ctx.openNote(rel.path) });
      if (below999 > 0) alerts.push({ level: below999 > 3 ? "crit" : "warn", text: `${below999} services <99.9% SLA`, actionLabel: "open", action: () => ctx.openNote(rel.path) });
    }

    // 5) stale local indexes (desktop only)
    const fs = Platform.isDesktopApp ? nodeRequire<NodeFs>("fs") : null;
    const base = vaultBasePath(ctx);
    if (fs && base) {
      if (fs.existsSync(`${base}/graphify-out/recall_needs_update`)) {
        alerts.push({ level: "warn", text: "recall index stale", actionLabel: "▶ reindex", action: () => guardedRun("claude /vault-recall index --update") });
      }
      if (fs.existsSync(`${base}/graphify-out/needs_update`)) {
        alerts.push({ level: "warn", text: "graph index stale", actionLabel: "▶ reindex", action: () => guardedRun("claude /graphify . --update") });
      }
    }

    // 6) local services down (probes need the web capability)
    if (ctx.trust.web) {
      const [ollama, firecrawl] = await Promise.all([checkOllama(), checkFirecrawl()]);
      if (!ollama.up) alerts.push({ level: "crit", text: "Ollama down", actionLabel: "▶ start", action: () => guardedRun("ollama serve") });
      if (!firecrawl.up) alerts.push({ level: "crit", text: "Firecrawl down", actionLabel: "▶ start", action: () => guardedRun("docker compose up -d") });
    }

    alerts.sort((a, b) => (a.level === "crit" ? 0 : 1) - (b.level === "crit" ? 0 : 1));

    if (alerts.length === 0) {
      const chip = bar.createDiv({ cls: "cc-alert cc-alert-ok" });
      chip.createSpan({ cls: "cc-alert__dot" });
      const suffix = ctx.trust.web ? "" : " (service probes off: web disabled)";
      chip.createSpan({ text: `all clear, no stale scans or CVEs${suffix}` });
      return;
    }
    for (const a of alerts) {
      const chip = bar.createDiv({ cls: `cc-alert cc-alert-${a.level}` });
      chip.createSpan({ cls: "cc-alert__dot" });
      chip.createSpan({ text: a.text });
      if (a.action) {
        const b = chip.createEl("button", { cls: "cc-alert__act", text: a.actionLabel || "go" });
        b.onclick = (e) => { e.stopPropagation(); a.action?.(); };
      }
    }
  },
};
