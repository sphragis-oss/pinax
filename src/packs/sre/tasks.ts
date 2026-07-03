import { Notice, TFile, TFolder } from "obsidian";
import type { WidgetContext, WidgetSpec } from "../../core/types";

interface DailyItem {
  text: string;
  done: boolean;
  section: string;
  line: number;
  hasCheckbox: boolean;
}

interface TaskItem extends DailyItem {
  source: TFile;
  sourceLabel: string;
  groupKey: string;
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

function deriveSourceLabel(file: TFile, dailyFolders: string[]): string {
  const p = file.path;
  for (const daily of dailyFolders) {
    if (p.startsWith(daily + "/")) return file.basename;
  }
  const parts = p.split("/").slice(0, -1);
  return parts.slice(1).join("/") || p;
}

function deriveGroupKey(file: TFile, dailyFolders: string[]): string {
  const p = file.path;
  for (const daily of dailyFolders) {
    if (p.startsWith(daily + "/")) return "daily";
  }
  const parts = p.split("/");
  if (parts.length >= 3) return parts[1] + "/" + parts[2];
  return "other";
}

async function walkForTasks(ctx: WidgetContext, folder: TFolder, exclude: string[], dailyFolders: string[], out: TaskItem[]): Promise<void> {
  if (exclude.some((e) => folder.path === e || folder.path.startsWith(e + "/"))) return;
  for (const child of folder.children) {
    if (child instanceof TFile && child.extension === "md" && child.name !== "_index.md") {
      let text: string;
      try { text = await ctx.app.vault.read(child); } catch { continue; }
      const fileItems = collectDailyItems(text);
      if (fileItems.length === 0) continue;
      const sourceLabel = deriveSourceLabel(child, dailyFolders);
      const groupKey = deriveGroupKey(child, dailyFolders);
      for (const fi of fileItems) {
        out.push({ ...fi, source: child, sourceLabel, groupKey });
      }
    } else if (child instanceof TFolder) {
      await walkForTasks(ctx, child, exclude, dailyFolders, out);
    }
  }
}

async function toggleTask(ctx: WidgetContext, file: TFile, item: TaskItem): Promise<void> {
  if (!item.hasCheckbox) return;
  if (!ctx.trust.write) {
    new Notice("pinax: enable Note writing in Settings → Pinax to toggle tasks.");
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

export const tasksWidget: WidgetSpec = {
  async render(el: HTMLElement, ctx: WidgetContext): Promise<void> {
    const folders = Array.isArray(ctx.pane.folders) ? (ctx.pane.folders as string[]) : DEFAULT_FOLDERS;
    const exclude = Array.isArray(ctx.pane.exclude) ? (ctx.pane.exclude as string[]) : DEFAULT_EXCLUDE;
    const dailyFolders = folders.filter((f) => f.toLowerCase().includes("daily"));

    const tasks: TaskItem[] = [];
    for (const fp of folders) {
      const folder = ctx.app.vault.getAbstractFileByPath(fp);
      if (folder instanceof TFolder) await walkForTasks(ctx, folder, exclude, dailyFolders, tasks);
    }
    if (tasks.length === 0) {
      el.createEl("div", { text: `No open tasks in ${folders.join("/ or ")}/.`, cls: "cc-empty" });
      return;
    }

    const openCount = tasks.filter((t) => !t.done).length;
    const checkboxCount = tasks.filter((t) => t.hasCheckbox).length;
    const meta = el.createDiv({ cls: "cc-meta" });
    meta.createSpan({ text: `${openCount} open · ${checkboxCount} toggleable · ${tasks.length} total`, cls: "cc-muted" });

    const grouped = new Map<string, TaskItem[]>();
    for (const t of tasks) {
      const list = grouped.get(t.groupKey) ?? [];
      list.push(t);
      grouped.set(t.groupKey, list);
    }

    const groupOrder = Array.from(grouped.keys()).sort((a, b) => {
      const rank = (k: string) => (k === "daily" ? 0 : k.startsWith("personal/") ? 1 : k.startsWith("work/") ? 2 : 3);
      const ra = rank(a), rb = rank(b);
      if (ra !== rb) return ra - rb;
      return a.localeCompare(b);
    });

    for (const groupKey of groupOrder) {
      const items = grouped.get(groupKey) ?? [];
      const head = el.createDiv({ cls: "cc-proj-group-head" });
      head.createSpan({ text: groupKey, cls: "cc-proj-group-name" });
      head.createSpan({ text: `${items.filter((i) => !i.done).length} open`, cls: "cc-muted" });

      const list = el.createEl("ul", { cls: "cc-task-list" });
      for (const it of items) {
        const li = list.createEl("li", { cls: "cc-task" + (it.done ? " cc-task-done" : "") });
        const box = li.createSpan({ text: it.done ? "[x]" : "[ ]", cls: "cc-task-box" });
        if (it.hasCheckbox) {
          box.classList.add("cc-clickable");
          box.title = "Toggle";
          box.onclick = () => { void toggleTask(ctx, it.source, it); };
        }
        const textEl = li.createSpan({ text: it.text, cls: "cc-task-text cc-clickable" });
        textEl.title = `Open ${it.source.path}`;
        textEl.onclick = () => ctx.openNote(it.source.path);
        li.createSpan({ text: it.sourceLabel, cls: "cc-task-section" });
      }
    }
  },
};
