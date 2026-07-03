import { TFile, TFolder } from "obsidian";
import type { WidgetContext, WidgetSpec } from "../../core/types";
import { parseFrontmatter, parseSectionedScan, findSectionByPrefix, stripFrontmatter, todayStr } from "./parse";
import { metaFileLink, ageDays, metricTile } from "./helpers";
import { renderPlatformSection, ownPane } from "./platform-render";

export const standupWidget: WidgetSpec = {
  async render(el: HTMLElement, ctx: WidgetContext): Promise<void> {
    const folderPath = String(ctx.pane.folder ?? "raw/daily");
    const folder = ctx.app.vault.getAbstractFileByPath(folderPath);
    if (!(folder instanceof TFolder)) {
      el.createEl("div", { text: "No daily folder yet. Run claude /standup-brief at end of day.", cls: "cc-empty" });
      return;
    }
    const today = todayStr();
    const expected = `${today}-standup.md`;
    let latest: TFile | null = null;
    for (const f of folder.children) {
      if (!(f instanceof TFile)) continue;
      if (f.name === expected) {
        latest = f;
        break;
      }
    }
    if (!latest) {
      const candidates = (folder.children.filter((f) => f instanceof TFile && /-standup\.md$/.test(f.name)) as TFile[])
        .sort((a, b) => b.name.localeCompare(a.name));
      latest = candidates[0] ?? null;
    }
    if (!latest) {
      el.createEl("div", { text: "No standup brief yet. Run claude /standup-brief at end of day.", cls: "cc-empty" });
      return;
    }
    const text = await ctx.app.vault.cachedRead(latest);
    const fm = parseFrontmatter(text);

    const meta = metaFileLink(el, latest, ctx);
    const age = ageDays(latest);
    if (age > 0) {
      meta.createSpan({ text: `${age}d old, re-run /standup-brief`, cls: "cc-jira-stale" });
    } else {
      meta.createSpan({ text: "fresh, today", cls: "cc-muted" });
    }

    const tiles = el.createDiv({ cls: "cc-metric-row cc-platform-tiles" });
    metricTile(tiles, "JIRA", fm.jira_changed ?? "0", "changed today");
    metricTile(tiles, "PRS", fm.prs_opened ?? "0", `${fm.prs_merged ?? "0"} merged today`);
    metricTile(tiles, "CONFLUENCE", fm.confluence_changed ?? "0", `${fm.confluence_created ?? "0"} created today`);
    metricTile(tiles, "COMMITS", fm.commits_total ?? "0", `${fm.repos_touched ?? "?"} repos`);
    metricTile(tiles, "SESSIONS", fm.sessions_count ?? "0", "claude sessions today");

    const parsed = parseSectionedScan(text);
    const renderPane = (key: string, title: string, pillCols: string[] = []): void => {
      const sec = findSectionByPrefix(parsed, key);
      if (!sec || (sec.tables.length === 0 && sec.notes.length === 0)) return;
      renderPlatformSection(ownPane(el, title), sec, pillCols);
    };

    renderPane("jira", "◆ JIRA");
    renderPane("pull requests", "⇪ PULL REQUESTS");
    renderPane("confluence", "◧ CONFLUENCE");
    renderPane("local commits", "» LOCAL COMMITS");
    renderPane("sessions", "☄ SESSIONS");
    renderPane("in progress", "▸ IN PROGRESS (FOR TOMORROW)");

    // Plan + Blockers are bullets, not tables; re-parse those sections
    const planActions: string[] = [];
    const blockActions: string[] = [];
    const stripped = stripFrontmatter(text);
    const blocks = stripped.split(/^##\s+/m).slice(1);
    for (const b of blocks) {
      const lines = b.split("\n");
      const heading = (lines.shift() || "").trim().toLowerCase();
      const target = heading.startsWith("plan for tomorrow") ? planActions
        : heading.startsWith("blockers") ? blockActions
        : null;
      if (!target) continue;
      for (const raw of lines) {
        const m = raw.match(/^-\s+(.+)$/);
        if (m) target.push(m[1].trim());
      }
    }
    if (planActions.length > 0 || blockActions.length > 0) {
      const pane = ownPane(el, "✎ PLAN + BLOCKERS");
      if (planActions.length > 0) {
        pane.createEl("div", { text: "Plan for tomorrow", cls: "cc-muted cc-platform-note" });
        const ul = pane.createEl("ul", { cls: "cc-platform-actions" });
        for (const a of planActions) ul.createEl("li", { text: a });
      }
      if (blockActions.length > 0) {
        pane.createEl("div", { text: "Blockers and heads-up", cls: "cc-muted cc-platform-note" });
        const ul = pane.createEl("ul", { cls: "cc-platform-actions" });
        for (const a of blockActions) ul.createEl("li", { text: a });
      }
    }
  },
};
