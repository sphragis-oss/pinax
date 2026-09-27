import { Notice, TFile, TFolder } from "obsidian";
import type { WidgetContext, WidgetSpec } from "../../core/types";
import { ageDays, ageLabel, fileDay, selectTasks, type SelectableTask } from "./tasks-select";

interface DailyItem {
  text: string;
  done: boolean;
  section: string;
  line: number;
  hasCheckbox: boolean;
}

interface TaskItem extends DailyItem, SelectableTask {
  source: TFile;
  sourceLabel: string;
}

const DEFAULT_FOLDERS = ["raw/daily", "projects"];
const DEFAULT_EXCLUDE = ["projects/personal/claude-os"];

function isPlaceholderTask(s: string): boolean {
  if (s.length === 0) return true;
  const t = s.trim().toLowerCase();
  if (t === "(none)" || t === "(none recorded)" || t === "none") return true;
  if (s.startsWith("[[raw/sessions/")) return true;
  return false;
}

function collectDailyItems(text: string): DailyItem[] {
  const allLines = text.split("\n");
  const wanted = [
    "follow-ups", "today's intent", "intent", "todo", "tasks",
    "open threads", "tomorrow", "action items",
  ];
  const items: DailyItem[] = [];
  let inSection: string | null = null;
  for (let i = 0; i < allLines.length; i++) {
    const line = allLines[i];
    const h = line.match(/^##\s+(.*)$/);
    if (h) {
      const headLower = h[1].toLowerCase();
      const matched = wanted.some((w) => headLower.includes(w));
      const excluded = headLower.includes("recurring");
      inSection = matched && !excluded ? h[1].trim() : null;
      continue;
    }
    if (!inSection) continue;
    const trimmed = line.trim();
    if (!trimmed.startsWith("- ")) continue;
    const body = trimmed.slice(2).trim();
    if (isPlaceholderTask(body)) continue;
    const m = body.match(/^\[( |x|X)\]\s*(.*)$/);
    if (m) {
      const t = m[2].trim();
      if (!isPlaceholderTask(t)) {
        items.push({ text: t, done: m[1].toLowerCase() === "x", section: inSection, line: i, hasCheckbox: true });
      }
    } else if (body.length > 0) {
      items.push({ text: body, done: false, section: inSection, line: i, hasCheckbox: false });
    }
  }
  return items;
}

function isDailyFile(file: TFile, dailyFolders: string[]): boolean {
  return dailyFolders.some((d) => file.path.startsWith(d + "/"));
}

function deriveSourceLabel(file: TFile, daily: boolean): string {
  if (daily) return file.basename;
  const parts = file.path.split("/").slice(0, -1);
  return parts.slice(1).join("/") || file.path;
}

async function walkForTasks(ctx: WidgetContext, folder: TFolder, exclude: string[], dailyFolders: string[], out: TaskItem[]): Promise<void> {
  if (exclude.some((e) => folder.path === e || folder.path.startsWith(e + "/"))) return;
  for (const child of folder.children) {
    if (child instanceof TFile && child.extension === "md" && child.name !== "_index.md") {
      let text: string;
      try { text = await ctx.app.vault.read(child); } catch { continue; }
      const fileItems = collectDailyItems(text);
      if (fileItems.length === 0) continue;
      const isDaily = isDailyFile(child, dailyFolders);
      const sourceLabel = deriveSourceLabel(child, isDaily);
      const day = fileDay(child.name, child.stat.mtime);
      for (const fi of fileItems) {
        out.push({ ...fi, source: child, sourceLabel, isDaily, day, path: child.path });
      }
    } else if (child instanceof TFolder) {
      await walkForTasks(ctx, child, exclude, dailyFolders, out);
    }
  }
}

async function toggleTask(ctx: WidgetContext, file: TFile, item: TaskItem): Promise<void> {
  if (!item.hasCheckbox) return;
  if (!ctx.trust.write) {
    new Notice("Pinax: enable Note writing in Settings → Pinax to toggle tasks.");
    return;
  }
  const fresh = await ctx.app.vault.read(file);
  const lines = fresh.split("\n");
  if (item.line >= lines.length) {
    new Notice("File changed since render. Refreshing.");
    ctx.refresh();
    return;
  }
  const line = lines[item.line];
  const newLine = item.done ? line.replace(/\[x\]/i, "[ ]") : line.replace(/\[ \]/, "[x]");
  if (newLine === line) {
    new Notice("Could not toggle, line shape changed. Refreshing.");
    ctx.refresh();
    return;
  }
  lines[item.line] = newLine;
  await ctx.app.vault.process(file, () => lines.join("\n"));
  ctx.refresh();
}

function renderList(parent: HTMLElement, ctx: WidgetContext, items: TaskItem[], today: Date): void {
  const list = parent.createEl("ul", { cls: "cc-task-list" });
  for (const it of items) {
    const li = list.createEl("li", { cls: "cc-task" + (it.hasCheckbox ? "" : " cc-task-plain") });
    const box = li.createSpan({ text: it.hasCheckbox ? "[ ]" : "·", cls: "cc-task-box" });
    if (it.hasCheckbox) {
      box.classList.add("cc-clickable");
      box.title = "Mark done";
      box.onclick = () => { void toggleTask(ctx, it.source, it); };
    }
    const body = li.createDiv({ cls: "cc-task-body" });
    const textEl = body.createSpan({ text: it.text, cls: "cc-task-text cc-clickable" });
    textEl.title = `Open ${it.source.path}`;
    textEl.onclick = () => ctx.openNote(it.source.path);
    const meta = body.createDiv({ cls: "cc-task-meta" });
    meta.createSpan({ text: it.sourceLabel, cls: "cc-task-source" });
    meta.createSpan({ text: ageLabel(ageDays(it.day, today)), cls: "cc-task-age" });
  }
}

function renderFold(parent: HTMLElement, ctx: WidgetContext, label: string, items: TaskItem[], today: Date): void {
  const fold = parent.createEl("details", { cls: "cc-task-more" });
  fold.createEl("summary", { text: label });
  renderList(fold, ctx, items, today);
}

export const tasksWidget: WidgetSpec = {
  async render(el: HTMLElement, ctx: WidgetContext): Promise<void> {
    const folders = Array.isArray(ctx.pane.folders) ? (ctx.pane.folders as string[]) : DEFAULT_FOLDERS;
    const exclude = Array.isArray(ctx.pane.exclude) ? (ctx.pane.exclude as string[]) : DEFAULT_EXCLUDE;
    const limit = Math.max(1, Number(ctx.pane.limit) || 8);
    const staleDays = Math.max(1, Number(ctx.pane.staleDays) || 30);
    const dailyFolders = folders.filter((f) => f.toLowerCase().includes("daily"));

    const tasks: TaskItem[] = [];
    for (const fp of folders) {
      const folder = ctx.app.vault.getAbstractFileByPath(fp);
      if (folder instanceof TFolder) await walkForTasks(ctx, folder, exclude, dailyFolders, tasks);
    }
    const today = new Date();
    const { fresh, stale } = selectTasks(tasks, today, staleDays);
    if (fresh.length === 0 && stale.length === 0) {
      el.createDiv({ text: `No open tasks in ${folders.join("/ or ")}/.`, cls: "cc-empty" });
      return;
    }

    const meta = el.createDiv({ cls: "cc-meta" });
    meta.createSpan({ text: `${fresh.length} open` + (stale.length > 0 ? ` · ${stale.length} stale` : ""), cls: "cc-muted" });

    renderList(el, ctx, fresh.slice(0, limit), today);
    if (fresh.length > limit) renderFold(el, ctx, `${fresh.length - limit} more`, fresh.slice(limit), today);
    if (stale.length > 0) renderFold(el, ctx, `stale · ${stale.length} · older than ${staleDays}d`, stale, today);
  },
};
