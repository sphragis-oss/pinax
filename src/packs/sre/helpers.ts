import { App, TFile, TFolder } from "obsidian";
import type { WidgetContext } from "../../core/types";

export function isScanFile(f: TFile): boolean {
  return f.extension === "md" && !f.name.startsWith("_");
}

export function scanFilesIn(app: App, folderPath: string): TFile[] {
  const f = app.vault.getAbstractFileByPath(folderPath);
  if (!(f instanceof TFolder)) return [];
  return f.children
    .filter((c): c is TFile => c instanceof TFile && isScanFile(c))
    .sort((a, b) => b.name.localeCompare(a.name));
}

export function metaFileLink(parent: HTMLElement, file: TFile, ctx: WidgetContext): HTMLElement {
  const meta = parent.createDiv({ cls: "cc-meta" });
  const link = meta.createEl("a", { text: file.name, cls: "cc-link" });
  link.onclick = (e) => { e.preventDefault(); ctx.openNote(file.path); };
  return meta;
}

export function ageDays(file: TFile): number {
  return Math.floor((Date.now() - file.stat.mtime) / 86_400_000);
}

export function metricTile(parent: HTMLElement, label: string, value: string, sub: string, variant?: "warn"): void {
  const cls = ["cc-metric-tile"];
  if (variant === "warn") cls.push("cc-metric-warn");
  const tile = parent.createDiv({ cls: cls.join(" ") });
  tile.createEl("div", { text: label, cls: "cc-metric-label" });
  const valueRow = tile.createDiv({ cls: "cc-metric-value-row" });
  valueRow.createEl("div", { text: value, cls: "cc-metric-value" });
  tile.createEl("div", { text: sub, cls: "cc-metric-sub" });
}

export function openExternal(url: string): void {
  window.open(url, "_blank");
}
