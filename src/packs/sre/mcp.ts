import { Notice } from "obsidian";
import type { WidgetContext, WidgetSpec } from "../../core/types";
import { parseMcpAudit } from "./parse";
import { scanFilesIn, metaFileLink } from "./helpers";

export const mcpWidget: WidgetSpec = {
  async render(el: HTMLElement, ctx: WidgetContext): Promise<void> {
    const pane = el.createDiv({ cls: "cc-pane cc-pane-wide" });
    pane.createEl("h3", { text: String(ctx.pane.title ?? "⊕ MCP SERVERS") });
    const folderPath = String(ctx.pane.folder ?? "raw/scans/mcp-audit");
    const files = scanFilesIn(ctx.app, folderPath);
    if (files.length === 0) {
      pane.createEl("div", { text: "No audit reports yet. Run /mcp-audit.", cls: "cc-empty" });
      return;
    }
    const latest = files[0];
    const entries = parseMcpAudit(await ctx.app.vault.cachedRead(latest));
    if (entries.length === 0) {
      pane.createEl("div", { text: "Audit parsed empty. Check the file format.", cls: "cc-empty" });
      return;
    }

    metaFileLink(pane, latest, ctx);

    let mcpQuery = "";
    let mcpStatus: "all" | "connected" | "needs-auth" | "failed" = "all";
    const statuses = ["all", "connected", "needs-auth", "failed"] as const;
    const counts: Record<string, number> = {
      all: entries.length,
      connected: entries.filter((e) => e.status === "connected").length,
      "needs-auth": entries.filter((e) => e.status === "needs-auth").length,
      failed: entries.filter((e) => e.status === "failed").length,
    };

    const controls = pane.createDiv({ cls: "cc-pane-controls" });
    const filter = controls.createEl("input", { cls: "cc-filter-input" });
    filter.placeholder = "filter servers (name, type, endpoint)…";
    const chips = controls.createDiv({ cls: "cc-chip-row" });
    const chipEls = new Map<string, HTMLElement>();
    for (const st of statuses) {
      const c = chips.createEl("button", {
        cls: "cc-chip" + (mcpStatus === st ? " cc-chip-on" : ""),
        text: `${st} ${counts[st]}`,
      });
      chipEls.set(st, c);
      c.onclick = () => {
        mcpStatus = st;
        chipEls.forEach((chip, k) => chip.toggleClass("cc-chip-on", k === st));
        rebuildList();
      };
    }
    const listWrap = pane.createDiv();

    const rebuildList = (): void => {
      listWrap.empty();
      const q = mcpQuery.toLowerCase();
      const shown = entries.filter((e) =>
        (mcpStatus === "all" || e.status === mcpStatus) &&
        (q === "" || (e.name + e.type + e.endpoint).toLowerCase().includes(q)));
      if (shown.length === 0) {
        listWrap.createEl("div", { text: "no servers match", cls: "cc-empty" });
        return;
      }
      const ul = listWrap.createEl("ul", { cls: "cc-mcp-list" });
      for (const e of shown) {
        const li = ul.createEl("li", { cls: "cc-mcp-row cc-mcp-" + e.status });
        const dot = li.createSpan({ cls: "cc-mcp-dot" });
        dot.setText(e.status === "connected" ? "●" : e.status === "needs-auth" ? "◐" : "✗");
        const nameEl = li.createSpan({ text: e.name, cls: "cc-mcp-name cc-clickable" });
        li.createSpan({ text: e.type, cls: "cc-mcp-type" });
        const epEl = li.createSpan({ text: e.endpoint, cls: "cc-mcp-endpoint" });
        epEl.title = e.endpoint;

        const detail = ul.createEl("li", { cls: "cc-mcp-detail" });
        detail.hide();
        detail.createDiv({ text: `type = ${e.type} · status = ${e.status}`, cls: "cc-muted" });
        detail.createDiv({ text: e.endpoint, cls: "cc-mcp-detail-ep" });
        nameEl.onclick = () => { if (detail.isShown()) detail.hide(); else detail.show(); };

        if (!e.name.startsWith("claude.ai ")) {
          if (e.status === "failed" || e.status === "needs-auth") {
            const gcmd = `claude mcp get ${e.name}`;
            const gBtn = li.createEl("button", { text: e.status === "needs-auth" ? "re-auth" : "logs", cls: "cc-mcp-rm" });
            gBtn.title = `Copy: ${gcmd}`;
            gBtn.onclick = async () => {
              try { await navigator.clipboard.writeText(gcmd); new Notice(`Copied: ${gcmd}`); }
              catch { new Notice(`Run: ${gcmd}`); }
            };
          }
          const cmd = `claude mcp remove ${e.name} -s user`;
          const rmBtn = li.createEl("button", { text: "remove", cls: "cc-mcp-rm" });
          rmBtn.title = `Copy: ${cmd}`;
          rmBtn.onclick = async () => {
            try { await navigator.clipboard.writeText(cmd); new Notice(`Copied: ${cmd}`); }
            catch { new Notice(`Run: ${cmd}`); }
          };
        } else {
          li.createSpan({ text: "managed by claude.ai", cls: "cc-muted cc-mcp-managed" });
        }
      }
    };

    filter.oninput = () => { mcpQuery = filter.value; rebuildList(); };
    rebuildList();
  },
};
