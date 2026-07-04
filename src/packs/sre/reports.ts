import { TFile, TFolder } from "obsidian";
import type { WidgetContext, WidgetSpec } from "../../core/types";
import { parseFrontmatter } from "./parse";
import { metricTile } from "./helpers";
import { ownPane } from "./platform-render";

function listMd(f: TFolder | undefined): TFile[] {
  if (!f) return [];
  return f.children
    .filter((c): c is TFile => c instanceof TFile && c.extension === "md" && !c.name.startsWith("_"))
    .sort((a, b) => b.name.localeCompare(a.name));
}

async function renderReportCard(el: HTMLElement, ctx: WidgetContext, folder: TFolder, name: string, role: string): Promise<void> {
  const pane = ownPane(el, role ? `◉ ${name} · ${role.toUpperCase()}` : `◉ ${name}`);

  const dailyFolder = folder.children.find((c): c is TFolder => c instanceof TFolder && c.name === "daily");
  const weeklyFolder = folder.children.find((c): c is TFolder => c instanceof TFolder && c.name === "weekly");
  const quarterlyFolder = folder.children.find((c): c is TFolder => c instanceof TFolder && c.name === "quarterly");
  const scorecardsFolder = folder.children.find((c): c is TFolder => c instanceof TFolder && c.name === "scorecards");

  const weeklies = listMd(weeklyFolder);
  const dailies = listMd(dailyFolder);
  const latestWeekly = weeklies[0] ?? null;

  if (latestWeekly) {
    const wText = await ctx.app.vault.cachedRead(latestWeekly);
    const wfm = parseFrontmatter(wText);
    const week = wfm.week ?? "";
    const range = wfm.range ?? "";
    const metaLine = pane.createDiv({ cls: "cc-meta" });
    const weekLink = metaLine.createEl("a", { text: week ? `WEEK ${week}` : latestWeekly.basename, cls: "cc-link" });
    weekLink.onclick = (e) => { e.preventDefault(); ctx.openNote(latestWeekly.path); };
    if (range) metaLine.createSpan({ text: range, cls: "cc-muted" });

    const row = pane.createDiv({ cls: "cc-metric-row" });
    metricTile(row, "COMMITS", wfm.commits_total ?? "0", `across ${wfm.repos_touched ?? "?"} repos`);
    metricTile(row, "JIRA CLOSED", wfm.jira_closed ?? "0", "this week");
    metricTile(row, "JIRA TOUCHED", wfm.jira_updated ?? "0", "PROD/SRE/SYS");
    metricTile(row, "CONFLUENCE", wfm.confluence_touched ?? "0", "pages edited");
  } else {
    pane.createEl("div", { text: "No weekly file yet. Run /dr-weekly.", cls: "cc-empty" });
  }

  let lastActive: { file: TFile; fm: Record<string, string> } | null = null;
  for (const d of dailies) {
    const text = await ctx.app.vault.cachedRead(d);
    const fm = parseFrontmatter(text);
    const sum =
      Number(fm.commits_total ?? "0") +
      Number(fm.jira_updated ?? "0") +
      Number(fm.jira_closed ?? "0") +
      Number(fm.confluence_touched ?? "0");
    if (sum > 0) {
      lastActive = { file: d, fm };
      break;
    }
  }

  if (lastActive) {
    const la = lastActive;
    const note = pane.createDiv({ cls: "cc-meta" });
    note.createSpan({ text: "LAST ACTIVE", cls: "cc-muted" });
    const link = note.createEl("a", { text: la.fm.date ?? la.file.basename, cls: "cc-link" });
    link.onclick = (e) => { e.preventDefault(); ctx.openNote(la.file.path); };
    note.createSpan({
      text: `commits ${lastActive.fm.commits_total ?? 0} · jira updated ${lastActive.fm.jira_updated ?? 0} · closed ${lastActive.fm.jira_closed ?? 0} · confluence ${lastActive.fm.confluence_touched ?? 0}`,
      cls: "cc-muted",
    });
  } else if (dailies.length > 0) {
    const note = pane.createDiv({ cls: "cc-meta" });
    note.createSpan({ text: "LAST ACTIVE", cls: "cc-muted" });
    note.createSpan({ text: "no activity in captured dailies", cls: "cc-muted" });
  }

  const quarterlies = listMd(quarterlyFolder);
  const scorecards = listMd(scorecardsFolder);
  const links = pane.createDiv({ cls: "cc-meta cc-report-links" });
  const addFolderLink = (label: string, f: TFolder | undefined, files: TFile[]): void => {
    if (!f) return;
    const latest = files[0];
    if (!latest) {
      links.createSpan({ text: `${label} (empty)`, cls: "cc-muted" });
      return;
    }
    const a = links.createEl("a", { text: `${label}${latest.basename}`, cls: "cc-link" });
    a.onclick = (e) => { e.preventDefault(); ctx.openNote(latest.path); };
  };
  addFolderLink("daily/", dailyFolder, dailies);
  addFolderLink("weekly/", weeklyFolder, weeklies);
  addFolderLink("quarterly/", quarterlyFolder, quarterlies);
  addFolderLink("scorecards/", scorecardsFolder, scorecards);
}

export const reportsWidget: WidgetSpec = {
  async render(el: HTMLElement, ctx: WidgetContext): Promise<void> {
    const rootPath = String(ctx.pane.folder ?? "projects/work/direct-reports");
    const root = ctx.app.vault.getAbstractFileByPath(rootPath);
    if (!(root instanceof TFolder)) {
      const empty = ownPane(el, "▸ DIRECT REPORTS");
      empty.createEl("div", { text: `No direct-reports project at ${rootPath}/. Scaffold the folder and run /dr-daily.`, cls: "cc-empty" });
      return;
    }

    const slugFolders = root.children.filter(
      (f): f is TFolder => f instanceof TFolder && !f.name.startsWith("_"),
    );
    if (slugFolders.length === 0) {
      const empty = ownPane(el, "▸ DIRECT REPORTS");
      empty.createEl("div", { text: "No reports configured.", cls: "cc-empty" });
      return;
    }

    const entries: { folder: TFolder; name: string; role: string }[] = [];
    for (const folder of slugFolders) {
      let name = folder.name;
      let role = "";
      const readme = ctx.app.vault.getAbstractFileByPath(`${folder.path}/README.md`);
      if (readme instanceof TFile) {
        const text = await ctx.app.vault.cachedRead(readme);
        const fm = parseFrontmatter(text);
        if (fm.title) name = fm.title.replace(/^["']|["']$/g, "");
        if (fm.role) role = fm.role.replace(/^["']|["']$/g, "");
      }
      entries.push({ folder, name, role });
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));

    for (const e of entries) {
      await renderReportCard(el, ctx, e.folder, e.name, e.role);
    }
  },
};
