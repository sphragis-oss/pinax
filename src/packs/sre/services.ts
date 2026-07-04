import { Platform } from "obsidian";
import type { WidgetCleanup, WidgetContext, WidgetSpec } from "../../core/types";
import { runCommand } from "../../core/terminal";
import { nodeRequire } from "../../core/platform";
import { checkOllama, checkFirecrawl, dockerPs } from "./probes";

type SvcAction = { label: string; cmd: string };
type Probe = { status: "up" | "down" | "stale"; badge: string; lines: string[]; actions: SvcAction[] };

function nowHHMM(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function indexProbe(ctx: WidgetContext, relFile: string, relMarker: string, label: string, updateCmd: string): Probe {
  const fs = nodeRequire<typeof import("fs")>("fs");
  const adapter = ctx.app.vault.adapter as { getBasePath?: () => string };
  const base = typeof adapter.getBasePath === "function" ? adapter.getBasePath() : null;
  if (!fs || !base) return { status: "down", badge: "n/a", lines: [label, "desktop only"], actions: [] };
  const file = `${base}/${relFile}`;
  if (!fs.existsSync(file)) {
    return { status: "down", badge: "none", lines: [label, "not built yet"], actions: [{ label: "build", cmd: updateCmd }] };
  }
  let ageStr = "?";
  try {
    const ms = Date.now() - fs.statSync(file).mtimeMs;
    const days = Math.floor(ms / 86400000);
    const hrs = Math.floor(ms / 3600000);
    ageStr = days >= 1 ? `${days}d ago` : hrs >= 1 ? `${hrs}h ago` : "today";
  } catch { /* ignore */ }
  const stale = fs.existsSync(`${base}/${relMarker}`);
  return {
    status: stale ? "stale" : "up",
    badge: stale ? "stale" : "fresh",
    lines: [label, `updated ${ageStr}`],
    actions: [{ label: "reindex", cmd: updateCmd }],
  };
}

// Runs local read-only probes (incl. `docker ps`), so the whole widget is command-gated
export const servicesWidget: WidgetSpec = {
  gate: "command",
  render(el: HTMLElement, ctx: WidgetContext): WidgetCleanup {
    const pane = el.createDiv({ cls: "cc-pane cc-pane-wide" });
    pane.createEl("h3", { text: String(ctx.pane.title ?? "◉ LOCAL STACK") });

    if (!Platform.isDesktopApp) {
      pane.createEl("div", { text: "Local service probes are desktop-only.", cls: "cc-empty" });
      return () => { /* nothing to clean */ };
    }

    const controls = pane.createDiv({ cls: "cc-svc-controls" });
    const autoOn = ctx.app.loadLocalStorage("cc-sys-autorefresh") === "1";
    const autoBtn = controls.createEl("button", {
      cls: "cc-chip" + (autoOn ? " cc-chip-on" : ""),
      text: autoOn ? "⟳ auto 15s: on" : "⟳ auto 15s: off",
    });
    const refreshBtn = controls.createEl("button", { cls: "cc-chip", text: "↻ refresh" });
    const stamp = controls.createSpan({ cls: "cc-muted cc-svc-stamp" });
    const grid = pane.createDiv({ cls: "cc-svc-grid" });

    const services: { name: string; probe: () => Promise<Probe> }[] = [
      { name: "Ollama", probe: async () => {
        const t0 = performance.now();
        const o = await checkOllama();
        const ms = Math.round(performance.now() - t0);
        return o.up
          ? { status: "up", badge: `${ms}ms`, lines: [`${o.model} · v${o.version || "?"}`, o.modelPulled ? "model pulled" : "model NOT pulled"], actions: [{ label: "restart", cmd: "ollama serve" }] }
          : { status: "down", badge: "down", lines: ["daemon unreachable :11434"], actions: [{ label: "start", cmd: "ollama serve" }] };
      } },
      { name: "Firecrawl", probe: async () => {
        const t0 = performance.now();
        const f = await checkFirecrawl();
        const ms = Math.round(performance.now() - t0);
        return f.up
          ? { status: "up", badge: `${ms}ms`, lines: [`localhost:${f.port}`, "self-hosted scraper"], actions: [{ label: "restart", cmd: "docker restart firecrawl-api-1" }] }
          : { status: "down", badge: "down", lines: ["stack down"], actions: [{ label: "start", cmd: "docker compose up -d" }] };
      } },
      { name: "Docker", probe: async () => {
        const d = await dockerPs();
        if (!d.up) return { status: "down", badge: "down", lines: ["daemon not reachable"], actions: [] };
        const fc = d.names.filter((n) => n.startsWith("firecrawl-")).length;
        return { status: "up", badge: `${d.count}`, lines: [`${d.count} containers running`, fc > 0 ? `${fc} firecrawl` : "no firecrawl containers"], actions: [{ label: "docker ps", cmd: "docker ps" }] };
      } },
      { name: "Recall index", probe: async () => indexProbe(ctx, "graphify-out/recall.db", "graphify-out/recall_needs_update", "bge-m3 embeddings", "claude /vault-recall index --update") },
      { name: "Graph index", probe: async () => indexProbe(ctx, "graphify-out/GRAPH_REPORT.md", "graphify-out/needs_update", "knowledge graph", "claude /graphify . --update") },
    ];

    const dotClass = (s: Probe["status"]): string => s === "up" ? "cc-svc-dot-up" : s === "stale" ? "cc-svc-dot-stale" : "cc-svc-dot-down";
    const badgeClass = (s: Probe["status"]): string => s === "up" ? "cc-ok" : s === "stale" ? "cc-stale" : "cc-warn";
    const actionBtn = (parent: HTMLElement, a: SvcAction): void => {
      const btn = parent.createEl("button", { cls: "cc-svc-action", text: a.label });
      btn.title = `copies "${a.cmd}" and opens a terminal; never auto-runs`;
      btn.onclick = () => { void runCommand(ctx.app, a.cmd); };
    };

    const rebuild = async (): Promise<void> => {
      grid.empty();
      const tiles = services.map((s) => {
        const tile = grid.createDiv({ cls: "cc-svc-tile" });
        const top = tile.createDiv({ cls: "cc-svc-top" });
        const dot = top.createSpan({ cls: "cc-svc-dot cc-svc-dot-wait" });
        top.createSpan({ text: s.name, cls: "cc-svc-name" });
        const badge = top.createSpan({ text: "…", cls: "cc-svc-lat" });
        const detail = tile.createDiv({ cls: "cc-svc-body" });
        detail.createDiv({ text: "checking…", cls: "cc-muted" });
        return { s, dot, badge, detail };
      });
      await Promise.all(tiles.map(async (t) => {
        let r: Probe;
        try { r = await t.s.probe(); }
        catch { r = { status: "down", badge: "err", lines: ["check failed"], actions: [] }; }
        t.dot.removeClass("cc-svc-dot-wait");
        t.dot.addClass(dotClass(r.status));
        t.badge.setText(r.badge);
        t.badge.addClass(badgeClass(r.status));
        t.detail.empty();
        for (const ln of r.lines) t.detail.createDiv({ text: ln, cls: "cc-svc-line" });
        if (r.actions.length > 0) {
          const actions = t.detail.createDiv({ cls: "cc-svc-actions" });
          for (const a of r.actions) actionBtn(actions, a);
        }
      }));
      stamp.setText(`updated ${nowHHMM()}`);
    };

    let timer: number | null = null;
    refreshBtn.onclick = () => { void rebuild(); };
    autoBtn.onclick = () => {
      ctx.app.saveLocalStorage("cc-sys-autorefresh", autoOn ? "0" : "1");
      ctx.refresh();
    };

    void rebuild();
    if (autoOn) {
      timer = window.setInterval(() => { void rebuild(); }, 15000);
    }
    return () => { if (timer !== null) window.clearInterval(timer); };
  },
};
