import { Notice, TFile } from "obsidian";
import type { App } from "obsidian";
import { expandVars } from "./template";

export interface ActionConfig {
  label: string;
  set: Record<string, string | number | boolean>;
}

export function paneActions(pane: Record<string, unknown>): ActionConfig[] {
  if (!Array.isArray(pane.actions)) return [];
  return pane.actions.filter((a): a is ActionConfig =>
    a !== null && typeof a === "object"
    && typeof (a as ActionConfig).label === "string"
    && (a as ActionConfig).set !== null && typeof (a as ActionConfig).set === "object",
  );
}

// Returns the previous values so the write can be undone
async function writeFields(app: App, file: TFile, fields: Record<string, unknown>): Promise<Record<string, unknown>> {
  const prev: Record<string, unknown> = {};
  await app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
    for (const [k, v] of Object.entries(fields)) {
      prev[k] = fm[k];
      if (v === undefined) delete fm[k];
      else fm[k] = typeof v === "string" ? expandVars(v, app) : v;
    }
  });
  return prev;
}

// Writes frontmatter fields (undefined deletes) and shows an Undo notice
export async function applySet(app: App, path: string, set: Record<string, unknown>, label = "Updated"): Promise<void> {
  const file = app.vault.getAbstractFileByPath(path);
  if (!(file instanceof TFile)) throw new Error(`pinax: note not found: ${path}`);
  const prev = await writeFields(app, file, set);
  const notice = new Notice(`${label} ${file.basename}`, 8000);
  const el = (notice as unknown as { noticeEl?: HTMLElement }).noticeEl;
  if (el) {
    const btn = el.createEl("button", { text: "Undo", cls: "px-btn px-undo-btn" });
    btn.onclick = () => {
      void writeFields(app, file, prev).catch((err) => console.error("pinax: undo failed", err));
      notice.hide();
    };
  }
}
