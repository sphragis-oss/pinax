import type { WidgetContext, WidgetSpec } from "../../core/types";
import { parseFrontmatter, parseJiraScan } from "./parse";
import { scanFilesIn, metaFileLink, ageDays, metricTile, openExternal } from "./helpers";

export const jiraWidget: WidgetSpec = {
  async render(el: HTMLElement, ctx: WidgetContext): Promise<void> {
    const folderPath = String(ctx.pane.folder ?? "raw/scans/jira");
    const files = scanFilesIn(ctx.app, folderPath);
    if (files.length === 0) {
      el.createEl("div", { text: "No jira scans yet. On the work box: claude /jira-mytickets.", cls: "cc-empty" });
      return;
    }
    const latest = files[0];
    const meta = metaFileLink(el, latest, ctx);
    const age = ageDays(latest);
    if (age > 1) {
      meta.createSpan({ text: `stale, ${age}d old, re-run on work box`, cls: "cc-jira-stale" });
    } else {
      meta.createSpan({ text: age === 0 ? "fresh, today" : "1d old", cls: "cc-muted" });
    }

    const text = await ctx.app.vault.cachedRead(latest);

    const fm = parseFrontmatter(text);
    const openedWk = fm.opened_this_week;
    const closedWk = fm.closed_this_week;
    const inProg = fm.in_progress;
    const toDo = fm.to_do;
    if (openedWk !== undefined || closedWk !== undefined || inProg !== undefined || toDo !== undefined) {
      const statsRow = el.createDiv({ cls: "cc-metric-row cc-jira-stats" });
      metricTile(statsRow, "OPENED (7D)", openedWk ?? "?", "this week");
      metricTile(statsRow, "CLOSED (7D)", closedWk ?? "?", "this week");
      metricTile(statsRow, "IN PROGRESS", inProg ?? "?", "right now");
      metricTile(statsRow, "TO DO", toDo ?? "?", "right now");
    }

    const groups = parseJiraScan(text);
    if (groups.length === 0) {
      el.createEl("div", { text: "Scan parsed empty. Check file format.", cls: "cc-empty" });
      return;
    }

    const priCounts = new Map<string, number>();
    for (const g of groups) for (const t of g.tickets) {
      const p = (t.priority || "").toLowerCase().replace(/[^a-z]/g, "") || "none";
      priCounts.set(p, (priCounts.get(p) ?? 0) + 1);
    }
    const total = groups.reduce((n, g) => n + g.tickets.length, 0);
    const chips = el.createDiv({ cls: "cc-chip-row" });
    const scanBody = el.createDiv({ cls: "cc-scan-body" });
    for (const g of groups) {
      if (g.tickets.length === 0) continue;
      const block = scanBody.createDiv({ cls: "cc-scan-section" });
      const h = block.createDiv({ cls: "cc-scan-section-head" });
      h.createSpan({ text: g.heading, cls: "cc-scan-section-title" });
      h.createSpan({ text: String(g.tickets.length), cls: "cc-scan-section-count" });

      const list = block.createEl("ul", { cls: "cc-jira-list" });
      for (const t of g.tickets) {
        const li = list.createEl("li", { cls: "cc-jira-row" });
        const pri = (t.priority || "").toLowerCase().replace(/[^a-z]/g, "") || "none";
        li.dataset.pri = pri;
        const keyEl = li.createEl("a", { text: t.key, cls: "cc-link cc-jira-key" });
        if (t.url) {
          keyEl.onclick = (e) => { e.preventDefault(); openExternal(t.url ?? ""); };
        }
        if (t.priority) {
          li.createSpan({ text: t.priority, cls: "cc-jira-pri cc-jira-pri-" + pri });
        }
        li.createSpan({ text: t.summary, cls: "cc-jira-summary" });
        li.createSpan({ text: t.updated, cls: "cc-jira-updated cc-muted" });
      }
    }

    const priOrder = ["all", "highest", "high", "medium", "low", "none"];
    const present = priOrder.filter((p) => p === "all" || priCounts.has(p));
    const chipEls = new Map<string, HTMLElement>();
    for (const p of present) {
      const c = chips.createEl("button", {
        cls: "cc-chip" + (p === "all" ? " cc-chip-on" : ""),
        text: p === "all" ? `all ${total}` : `${p} ${priCounts.get(p)}`,
      });
      chipEls.set(p, c);
      c.onclick = () => {
        chipEls.forEach((chipEl, k) => chipEl.toggleClass("cc-chip-on", k === p));
        scanBody.querySelectorAll<HTMLElement>(".cc-jira-row").forEach((row) => {
          row.style.display = (p === "all" || row.dataset.pri === p) ? "" : "none";
        });
      };
    }
  },
};
