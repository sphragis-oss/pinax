import { TFile, TFolder } from "obsidian";
import type { WidgetContext, WidgetSpec } from "../../core/types";

function folderHasReadme(f: TFolder): boolean {
  return f.children.some(
    (c) => c instanceof TFile && (c.name === "README.md" || c.name === "readme.md"),
  );
}

function countFiles(folder: TFolder): number {
  let n = 0;
  for (const c of folder.children) {
    if (c instanceof TFile) n++;
    else if (c instanceof TFolder) n += countFiles(c);
  }
  return n;
}

function lastModified(folder: TFolder): string {
  let latest = 0;
  const walk = (f: TFolder): void => {
    for (const c of f.children) {
      if (c instanceof TFile) { if (c.stat.mtime > latest) latest = c.stat.mtime; }
      else if (c instanceof TFolder) walk(c);
    }
  };
  walk(folder);
  if (latest === 0) return "empty";
  const days = Math.floor((Date.now() - latest) / (1000 * 60 * 60 * 24));
  if (days === 0) return "today";
  if (days === 1) return "1d ago";
  return `${days}d ago`;
}

function renderProjectList(el: HTMLElement, ctx: WidgetContext, projects: TFolder[], scope?: string): void {
  const list = el.createEl("ul", { cls: "cc-list" });
  for (const p of projects) {
    const item = list.createEl("li", { cls: "cc-proj-row" });
    const left = item.createSpan({ cls: "cc-proj-left" });
    const link = left.createEl("a", { text: p.name, cls: "cc-link cc-proj-name" });
    link.onclick = (e) => {
      e.preventDefault();
      const readme = `${p.path}/README.md`;
      const target = ctx.app.vault.getAbstractFileByPath(readme) ? readme : p.path;
      ctx.openNote(target);
    };
    if (scope) {
      const label = scope === "work" ? "workable" : scope;
      left.createSpan({ text: label, cls: "cc-proj-scope cc-proj-scope-" + scope });
    }
    const right = item.createSpan({ cls: "cc-muted" });
    right.setText(`${countFiles(p)} files · ${lastModified(p)}`);
  }
}

export const projectsWidget: WidgetSpec = {
  render(el: HTMLElement, ctx: WidgetContext): void {
    const folderPath = String(ctx.pane.folder ?? "projects");
    const root = ctx.app.vault.getAbstractFileByPath(folderPath);
    if (!(root instanceof TFolder)) {
      el.createEl("div", { text: `No ${folderPath}/ folder.`, cls: "cc-empty" });
      return;
    }
    const subs = root.children.filter((f): f is TFolder => f instanceof TFolder);
    if (subs.length === 0) {
      el.createEl("div", { text: `No active projects. Create ${folderPath}/<scope>/<name>/ to populate.`, cls: "cc-empty" });
      return;
    }

    const looseProjects: TFolder[] = [];
    const groups: TFolder[] = [];
    for (const c of subs) {
      if (folderHasReadme(c)) looseProjects.push(c);
      else groups.push(c);
    }

    if (groups.length === 0 && looseProjects.length > 0) {
      renderProjectList(el, ctx, looseProjects);
      return;
    }

    for (const group of groups) {
      const groupProjects = group.children.filter((f): f is TFolder => f instanceof TFolder);
      if (groupProjects.length === 0) continue;
      const head = el.createDiv({ cls: "cc-proj-group-head" });
      head.createSpan({ text: group.name, cls: "cc-proj-group-name" });
      head.createSpan({ text: `${groupProjects.length} project${groupProjects.length === 1 ? "" : "s"}`, cls: "cc-muted" });
      renderProjectList(el, ctx, groupProjects, group.name);
    }
    if (looseProjects.length > 0) {
      const head = el.createDiv({ cls: "cc-proj-group-head" });
      head.createSpan({ text: "(uncategorized)", cls: "cc-proj-group-name" });
      renderProjectList(el, ctx, looseProjects);
    }
  },
};
