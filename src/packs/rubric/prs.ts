import type { WidgetContext, WidgetSpec } from "../../core/types";
import { scanFilesIn, metaFileLink, ageDays, openExternal } from "../sre/helpers";
import { runCommand } from "../../core/terminal";

interface PrRow { repo: string; title: string; url: string; draft: boolean; date: string; }

// rows come from gh-prs-scan: "- **owner/repo** [title](url)( · draft) · YYYY-MM-DD"
const ROW = /^- \*\*(.+?)\*\* \[(.+?)\]\((\S+?)\)((?: · draft)?) · (\d{4}-\d{2}-\d{2})$/;

function parseRows(text: string): PrRow[] {
  const rows: PrRow[] = [];
  for (const line of text.split("\n")) {
    const m = line.match(ROW);
    if (!m) continue;
    rows.push({ repo: m[1], title: m[2], url: m[3], draft: m[4] !== "", date: m[5] });
  }
  return rows;
}

export const prsWidget: WidgetSpec = {
  async render(el: HTMLElement, ctx: WidgetContext): Promise<void> {
    const folderPath = String(ctx.pane.folder ?? "raw/scans/github-prs");
    const refresh = String(ctx.pane.refreshCommand ?? "~/.claude/bin/gh-prs-scan");
    const files = scanFilesIn(ctx.app, folderPath);
    if (files.length === 0) {
      el.createDiv({ text: "No PR scans yet. Run gh-prs-scan once.", cls: "cc-empty" });
      return;
    }
    const latest = files[0];
    const meta = metaFileLink(el, latest, ctx);
    const age = ageDays(latest);
    meta.createSpan({ text: age === 0 ? "fresh, today" : `${age}d old`, cls: age > 1 ? "cc-jira-stale" : "cc-muted" });
    if (ctx.trust.command) {
      const btn = meta.createEl("button", { text: "↻ refresh", cls: "cc-chip cc-pr-refresh" });
      btn.title = `Copies "${refresh}" and opens a terminal. Never auto-runs.`;
      btn.onclick = () => { void runCommand(ctx.app, refresh); };
    }

    const rows = parseRows(await ctx.app.vault.cachedRead(latest));
    if (rows.length === 0) {
      el.createDiv({ text: "No open PRs outside Workable.", cls: "cc-empty" });
      return;
    }
    const list = el.createEl("ul", { cls: "cc-jira-list" });
    for (const r of rows) {
      const li = list.createEl("li", { cls: "cc-pr-row" });
      const chip = li.createSpan({ text: r.repo.split("/").pop() ?? r.repo, cls: "cc-pr-repo" });
      chip.title = r.repo;
      const a = li.createEl("a", { text: r.title, cls: "cc-pr-title" });
      a.title = `${r.repo}: ${r.title}`;
      a.onclick = (e) => { e.preventDefault(); openExternal(r.url); };
      if (r.draft) li.createSpan({ text: "draft", cls: "cc-pr-draft" });
      li.createSpan({ text: r.date, cls: "cc-pr-date" });
    }
  },
};
