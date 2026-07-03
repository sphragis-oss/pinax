import type { PlatformSection } from "./parse";
import { openExternal } from "./helpers";

export function appendMarkdownCell(td: HTMLElement, cellText: string): void {
  const linkRe = /\[([^\]]+)\]\(([^)]+)\)/g;
  let lastIdx = 0;
  let m: RegExpExecArray | null;
  while ((m = linkRe.exec(cellText)) !== null) {
    if (m.index > lastIdx) td.appendText(cellText.slice(lastIdx, m.index));
    const a = td.createEl("a", { text: m[1], cls: "cc-link" });
    a.setAttr("href", m[2]);
    a.onclick = (e) => {
      e.preventDefault();
      openExternal(m![2]);
    };
    lastIdx = m.index + m[0].length;
  }
  if (lastIdx < cellText.length) td.appendText(cellText.slice(lastIdx));
}

export function platformStatusPill(td: HTMLElement, raw: string): void {
  const warn = raw.includes("⚠");
  const text = raw.replace(/⚠/g, "").trim();
  const lower = text.toLowerCase();
  let cls = "cc-platform-pill";
  if (lower === "plan ok" || lower === "ok") cls += " cc-platform-pill-ok";
  else if (lower === "plan fail" || lower === "unreachable") cls += " cc-platform-pill-fail";
  else cls += " cc-platform-pill-warn";
  if (warn) cls += " cc-platform-pill-warn";
  td.createSpan({ text: text || "?", cls });
}

export function renderPlatformSection(parent: HTMLElement, sec: PlatformSection, pillColumns: string[] = []): void {
  if (sec.tables.length === 0 && sec.notes.length === 0) {
    parent.createEl("div", { text: "(no data)", cls: "cc-empty" });
    return;
  }
  const noteQueue = [...sec.notes];
  for (const t of sec.tables) {
    const noteForThisTable = noteQueue.shift();
    if (noteForThisTable) parent.createEl("div", { text: noteForThisTable, cls: "cc-muted cc-platform-note" });
    const tbl = parent.createEl("table", { cls: "cc-platform-table" });
    const thead = tbl.createEl("thead");
    const headRow = thead.createEl("tr");
    const pillIdxs = new Set<number>();
    for (let i = 0; i < t.headers.length; i++) {
      const h = t.headers[i];
      headRow.createEl("th", { text: h });
      if (pillColumns.some((pc) => h.toLowerCase().includes(pc.toLowerCase()))) {
        pillIdxs.add(i);
      }
    }
    const tbody = tbl.createEl("tbody");
    for (const r of t.rows) {
      const tr = tbody.createEl("tr");
      for (let i = 0; i < r.length; i++) {
        const td = tr.createEl("td");
        if (pillIdxs.has(i)) {
          platformStatusPill(td, r[i]);
        } else {
          appendMarkdownCell(td, r[i]);
        }
      }
    }
  }
  while (noteQueue.length > 0) {
    const n = noteQueue.shift()!;
    parent.createEl("div", { text: n, cls: "cc-muted cc-platform-note" });
  }
}

export function sectionLabel(body: HTMLElement, text: string): void {
  body.createDiv({ text, cls: "cc-tab-section" });
}

export function ownPane(body: HTMLElement, title: string): HTMLElement {
  const pane = body.createDiv({ cls: "cc-pane cc-pane-wide" });
  pane.createEl("h3", { text: title });
  return pane;
}
