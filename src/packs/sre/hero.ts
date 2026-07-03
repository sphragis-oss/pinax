import { Notice, Platform, TFile, TFolder } from "obsidian";
import type { WidgetContext, WidgetSpec } from "../../core/types";
import { parseScan, todayStr } from "./parse";
import { isScanFile, scanFilesIn } from "./helpers";
import { appendLogo } from "./logo";
import { aggregateWindow, prettyModel } from "./usage";
import { checkOllama, checkFirecrawl } from "./probes";

interface AgeInfo { label: string; stale: boolean; }

function ageOf(ctx: WidgetContext, path: string): AgeInfo | null {
  const f = ctx.app.vault.getAbstractFileByPath(path);
  if (!(f instanceof TFolder)) return null;
  const files = f.children
    .filter((c): c is TFile => c instanceof TFile && isScanFile(c))
    .sort((a, b) => b.stat.mtime - a.stat.mtime);
  if (files.length === 0) return null;
  const ms = Date.now() - files[0].stat.mtime;
  const hr = Math.floor(ms / 3600000);
  if (hr < 1) return { label: "fresh", stale: false };
  if (hr < 24) return { label: `${hr}h`, stale: false };
  const d = Math.floor(hr / 24);
  return { label: `${d}d`, stale: d >= 1 };
}

function folderHasReadme(f: TFolder): boolean {
  return f.children.some((c) => c instanceof TFile && (c.name === "README.md" || c.name === "readme.md"));
}

async function readMachine(ctx: WidgetContext): Promise<string> {
  try {
    const raw = await ctx.app.vault.adapter.read(".machine");
    return raw.trim().split(/\s+/)[0] || "unknown";
  } catch {
    return "unknown";
  }
}

interface HeroStats {
  cncf: AgeInfo | null; gh: AgeInfo | null; clot: AgeInfo | null; jira: AgeInfo | null;
  releases: number; cves: number; keps: number; trending: number; projects: number;
}

async function gatherStats(ctx: WidgetContext): Promise<HeroStats> {
  let releases = 0, cves = 0, keps = 0, trending = 0;
  const scans = scanFilesIn(ctx.app, "raw/scans");
  if (scans.length > 0) {
    for (const s of parseScan(await ctx.app.vault.cachedRead(scans[0]))) {
      if (s.kind === "cve") cves = s.bullets.length;
      else if (s.kind === "kep") keps = s.bullets.length;
      else if (s.kind === "release") releases = s.bullets.length;
    }
  }
  const gh = scanFilesIn(ctx.app, "raw/scans/github-trending");
  if (gh.length > 0) {
    trending = parseScan(await ctx.app.vault.cachedRead(gh[0])).reduce((n, s) => n + s.rows.length, 0);
  }
  let projects = 0;
  const projFolder = ctx.app.vault.getAbstractFileByPath("projects");
  if (projFolder instanceof TFolder) {
    for (const child of projFolder.children) {
      if (!(child instanceof TFolder)) continue;
      if (folderHasReadme(child)) projects++;
      else for (const grand of child.children) {
        if (grand instanceof TFolder && folderHasReadme(grand)) projects++;
      }
    }
  }
  return {
    cncf: ageOf(ctx, "raw/scans"),
    gh: ageOf(ctx, "raw/scans/github-trending"),
    clot: ageOf(ctx, "raw/scans/clotributor"),
    jira: ageOf(ctx, "raw/scans/jira"),
    releases, cves, keps, trending, projects,
  };
}

async function quickCapture(ctx: WidgetContext, text: string): Promise<void> {
  if (!ctx.trust.write) {
    new Notice("pinax: enable Note writing in Settings → Pinax to capture.");
    return;
  }
  const date = todayStr();
  const path = `raw/daily/${date}.md`;
  const d = new Date();
  const bullet = `- ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")} ${text}`;
  let file = ctx.app.vault.getAbstractFileByPath(path);

  if (!(file instanceof TFile)) {
    const fm = [
      "---", `title: ${date}`, "type: daily", `date: ${date}`, "machine: personal", "tags: [daily]", "---",
      "", "## Notes / captures", bullet, "",
    ].join("\n");
    try {
      file = await ctx.app.vault.create(path, fm);
      new Notice(`Created daily + captured: ${text.slice(0, 40)}`);
    } catch (err) {
      new Notice(`Capture failed: ${String(err)}`);
      return;
    }
  } else {
    await ctx.app.vault.process(file, (content) => {
      if (/^##\s+Notes\s*\/\s*captures\s*$/m.test(content)) {
        return content.replace(/(^##\s+Notes\s*\/\s*captures\s*$)/m, `$1\n${bullet}`);
      }
      return content.trimEnd() + `\n\n## Notes / captures\n${bullet}\n`;
    });
    new Notice(`Captured: ${text.slice(0, 40)}`);
  }
  ctx.refresh();
}

export const heroWidget: WidgetSpec = {
  async render(el: HTMLElement, ctx: WidgetContext): Promise<void> {
    const hero = el.createDiv({ cls: "cc-hero" });

    const bar = hero.createDiv({ cls: "cc-hero__titlebar" });
    bar.createDiv({ cls: "cc-hero__dots" });
    bar.createSpan({ text: "~/the-helm", cls: "cc-hero__path" });
    const actions = bar.createDiv({ cls: "cc-hero__actions" });
    const badge = actions.createEl("span", { text: "● LIVE", cls: "cc-badge cc-badge-live" });
    badge.title = "Reading vault state in real time";

    const bodyEl = hero.createDiv({ cls: "cc-hero__body" });
    const gridEl = bodyEl.createDiv({ cls: "cc-hero__grid" });
    const neo = gridEl.createDiv({ cls: "cc-hero__neofetch" });
    appendLogo(neo.createDiv({ cls: "cc-hero__art" }));
    const info = neo.createDiv({ cls: "cc-hero__info" });

    const machine = await readMachine(ctx);
    const user = String(ctx.pane.user ?? "nick");
    const host = info.createEl("p", { cls: "cc-hero__host" });
    host.createSpan({ text: user, cls: "cc-hero__host-accent" });
    host.createSpan({ text: "@" });
    host.createSpan({ text: "the-helm", cls: "cc-hero__host-accent" });
    info.createDiv({ text: "─".repeat(30), cls: "cc-hero__rule" });

    const stats = await gatherStats(ctx);
    const specs = info.createEl("dl", { cls: "cc-hero__specs" });
    const spec = (dt: string, build: (dd: HTMLElement) => void): void => {
      const row = specs.createDiv({ cls: "cc-hero__spec" });
      row.createEl("dt", { text: dt });
      build(row.createEl("dd"));
    };

    spec("os", (dd) => dd.setText(`ClaudeVault · ${machine} · ${todayStr()}`));
    spec("radar", (dd) => {
      const parts: { label: string; age: AgeInfo | null }[] = [
        { label: "cncf", age: stats.cncf }, { label: "gh", age: stats.gh },
        { label: "clot", age: stats.clot }, { label: "jira", age: stats.jira },
      ];
      let first = true;
      for (const p of parts) {
        if (!p.age) continue;
        if (!first) dd.createSpan({ text: "·", cls: "cc-hero-sep" });
        first = false;
        dd.appendText(`${p.label} `);
        dd.createSpan({ text: p.age.label, cls: p.age.stale ? "cc-warn" : "cc-ok" });
      }
      if (first) dd.setText("no scans yet");
    });
    spec("feed", (dd) => {
      dd.appendText(`${stats.releases} releases`);
      dd.createSpan({ text: "·", cls: "cc-hero-sep" });
      const cve = dd.createSpan({ text: `${stats.cves} CVEs` });
      if (stats.cves > 0) cve.addClass("cc-warn");
      dd.createSpan({ text: "·", cls: "cc-hero-sep" });
      dd.appendText(`${stats.keps} KEPs`);
      dd.createSpan({ text: "·", cls: "cc-hero-sep" });
      dd.appendText(`${stats.trending} trending`);
    });
    spec("work", (dd) => {
      dd.appendText(`${stats.projects} projects`);
    });
    spec("claude", (dd) => {
      if (!Platform.isDesktopApp) { dd.setText("desktop only"); dd.addClass("cc-muted"); return; }
      dd.setText("reading sessions…");
      dd.addClass("cc-muted");
      void aggregateWindow(7).then((agg) => {
        dd.empty();
        dd.removeClass("cc-muted");
        if (!agg || agg.bucket.sessions === 0) { dd.setText("no local sessions in 7d"); return; }
        const fav = agg.byModel[0] ? prettyModel(agg.byModel[0].model) : "-";
        dd.createSpan({ text: fav, cls: "cc-ok" });
        dd.createSpan({ text: " favourite", cls: "cc-hero-note" });
        dd.createSpan({ text: "·", cls: "cc-hero-sep" });
        dd.appendText(`${agg.bucket.sessions} sessions`);
        dd.createSpan({ text: "·", cls: "cc-hero-sep" });
        dd.appendText(`${agg.bucket.cacheHitPct}% cache`);
      }).catch(() => { dd.empty(); dd.setText("usage unavailable"); });
    });
    const probeSpec = (name: string, run: (dd: HTMLElement) => void): void => {
      spec(name, (dd) => {
        if (!ctx.trust.web) { dd.setText("web disabled in Settings"); dd.addClass("cc-muted"); return; }
        run(dd);
      });
    };
    probeSpec("ollama", (dd) => {
      dd.setText("pinging…");
      dd.addClass("cc-muted");
      void checkOllama().then((o) => {
        dd.empty();
        dd.removeClass("cc-muted");
        if (!o.up) { dd.createSpan({ text: "down", cls: "cc-warn" }); return; }
        dd.createSpan({ text: "up", cls: "cc-ok" });
        dd.createSpan({ text: "·", cls: "cc-hero-sep" });
        dd.appendText(o.model);
        dd.createSpan({ text: " vault search", cls: "cc-hero-note" });
        if (!o.modelPulled) dd.createSpan({ text: " not pulled", cls: "cc-warn" });
        if (o.version) {
          dd.createSpan({ text: "·", cls: "cc-hero-sep" });
          dd.appendText(`v${o.version}`);
        }
      }).catch(() => { dd.empty(); dd.setText("check failed"); });
    });
    probeSpec("firecrawl", (dd) => {
      dd.setText("pinging…");
      dd.addClass("cc-muted");
      void checkFirecrawl().then((f) => {
        dd.empty();
        dd.removeClass("cc-muted");
        if (!f.up) { dd.createSpan({ text: "down", cls: "cc-warn" }); return; }
        dd.createSpan({ text: "up", cls: "cc-ok" });
        dd.createSpan({ text: "·", cls: "cc-hero-sep" });
        dd.appendText(`localhost:${f.port}`);
        dd.createSpan({ text: " self-hosted scraper", cls: "cc-hero-note" });
      }).catch(() => { dd.empty(); dd.setText("check failed"); });
    });

    const side = gridEl.createDiv({ cls: "cc-hero__side" });
    const panel = side.createDiv({ cls: "cc-hero__side-panel" });
    const sideBar = panel.createDiv({ cls: "cc-hero__side-titlebar" });
    sideBar.createSpan({ text: "❯", cls: "cc-hero__prompt" });
    sideBar.appendText("shortcuts");
    const keys = panel.createDiv({ cls: "cc-hero__keys" });
    const key = (k: string, label: string): void => {
      const row = keys.createDiv({ cls: "cc-hero__key" });
      row.createEl("kbd", { text: k });
      row.appendText(label);
    };
    key("⌘K", "command palette");
    key("1-9", "switch tab");
    key("r", "refresh");
    key("t", "theme");
    const stat = panel.createDiv({ cls: "cc-hero__side-stats" });
    const cell = (v: string, l: string, warn = false): void => {
      const c = stat.createDiv({ cls: "cc-hero__stat" });
      c.createDiv({ text: v, cls: "cc-hero__stat-v" + (warn ? " cc-warn" : "") });
      c.createDiv({ text: l, cls: "cc-hero__stat-l" });
    };
    cell(String(stats.cves), "CVEs", stats.cves > 0);
    cell(String(stats.trending), "trending");
    cell(String(stats.projects), "projects");

    const cmd = bodyEl.createDiv({ cls: "cc-hero__cmd" });
    cmd.createSpan({ text: "❯", cls: "cc-hero__prompt" });
    const input = cmd.createEl("input");
    input.placeholder = ctx.trust.write
      ? "capture to today's daily note, Enter saves…"
      : "quick capture needs Note writing enabled in Settings";
    input.onkeydown = async (e) => {
      if (e.key === "Enter") {
        const text = input.value.trim();
        if (text.length === 0) return;
        input.value = "";
        await quickCapture(ctx, text);
      }
    };
  },
};
