import { MarkdownRenderer, Notice } from "obsidian";
import type { WidgetContext, WidgetSpec } from "../../core/types";
import { parseScan, parseCveBullet, parseKepBullet, parseReleaseBullet, stripFrontmatter, ScanSection, TableRow } from "./parse";
import { scanFilesIn, metaFileLink, openExternal } from "./helpers";

function renderTableRows(parent: HTMLElement, rows: TableRow[]): void {
  if (rows.length === 0) {
    parent.createEl("div", { text: "(none)", cls: "cc-empty" });
    return;
  }
  const list = parent.createEl("ul", { cls: "cc-repo-list" });
  for (const r of rows) {
    const li = list.createEl("li", { cls: "cc-repo-row" });
    li.dataset.stars = String(r.starsNum);
    li.createSpan({ text: r.rank, cls: "cc-repo-rank" });
    const repoEl = li.createEl("a", { text: r.repo, cls: "cc-link cc-repo-name" });
    if (r.url) {
      repoEl.onclick = (e) => { e.preventDefault(); openExternal(r.url ?? ""); };
    }
    li.createSpan({ text: "★" + r.stars, cls: "cc-repo-stars" });
    if (r.lang && r.lang !== "?") {
      li.createSpan({ text: r.lang, cls: "cc-repo-lang" });
    }
    li.createSpan({ text: r.desc, cls: "cc-repo-desc" });
  }
}

function renderScanSection(parent: HTMLElement, sec: ScanSection, ctx: WidgetContext): void {
  const block = parent.createDiv({ cls: "cc-scan-section" });
  const h = block.createDiv({ cls: "cc-scan-section-head" });
  h.createSpan({ text: sec.heading, cls: "cc-scan-section-title" });
  const count = sec.kind === "table" ? sec.rows.length : sec.bullets.length;
  h.createSpan({ text: String(count), cls: "cc-scan-section-count" });

  if (sec.kind === "table") {
    renderTableRows(block, sec.rows);
    return;
  }

  if (sec.bullets.length === 0) {
    const note = block.createDiv({ cls: "cc-empty" });
    note.setText(sec.emptyNote ?? "(none)");
    return;
  }

  if (sec.kind === "cve") {
    for (const b of sec.bullets) {
      const c = parseCveBullet(b);
      const card = block.createDiv({ cls: "cc-cve-card" });
      const top = card.createDiv({ cls: "cc-cve-top" });
      const idEl = top.createSpan({ text: c.id, cls: "cc-cve-id cc-clickable" });
      idEl.title = "Click to copy";
      idEl.onclick = async (e) => {
        e.stopPropagation();
        try {
          await navigator.clipboard.writeText(c.id);
          new Notice(`Copied: ${c.id}`);
        } catch {
          new Notice(`Failed to copy ${c.id}`);
        }
      };
      if (c.ecosystem) top.createSpan({ text: c.ecosystem, cls: "cc-cve-eco" });
      top.createSpan({ text: "HIGH+", cls: "cc-cve-sev" });
      const titleEl = card.createDiv({ text: c.title, cls: "cc-cve-title" });
      if (c.url) {
        titleEl.classList.add("cc-clickable");
        titleEl.onclick = () => openExternal(c.url ?? "");
      }
    }
    return;
  }

  if (sec.kind === "kep") {
    const list = block.createEl("ul", { cls: "cc-kep-list" });
    for (const b of sec.bullets) {
      const k = parseKepBullet(b);
      const li = list.createEl("li", { cls: "cc-kep-row" });
      if (k.ts) li.createSpan({ text: k.ts.slice(0, 10), cls: "cc-kep-date" });
      if (k.id) {
        const num = k.id.replace(/^KEP-/, "");
        const idEl = li.createEl("a", { text: k.id, cls: "cc-link cc-kep-id" });
        idEl.onclick = (e) => {
          e.preventDefault();
          openExternal(`https://github.com/kubernetes/enhancements/issues/${num}`);
        };
      }
      if (k.text) li.createSpan({ text: k.text, cls: "cc-kep-text" });
    }
    return;
  }

  if (sec.kind === "release") {
    const list = block.createEl("ul", { cls: "cc-release-list" });
    for (const b of sec.bullets) {
      const r = parseReleaseBullet(b);
      const li = list.createEl("li", { cls: "cc-release-row" });
      li.createSpan({ text: r.repo, cls: "cc-release-repo" });
      if (r.tag) {
        if (r.url) {
          const a = li.createEl("a", { text: r.tag, cls: "cc-link cc-release-tag" });
          a.onclick = (e) => { e.preventDefault(); openExternal(r.url ?? ""); };
        } else {
          li.createSpan({ text: r.tag, cls: "cc-release-tag" });
        }
      }
      if (r.name) li.createSpan({ text: r.name, cls: "cc-release-name" });
      if (r.date) li.createSpan({ text: r.date, cls: "cc-release-date" });
    }
    return;
  }

  const list = block.createEl("ul", { cls: "cc-scan-list" });
  for (const b of sec.bullets) {
    const li = list.createEl("li");
    void MarkdownRenderer.render(ctx.app, b, li, "", ctx.component);
  }
}

// Row filter across rendered section rows (port of the seed's attachRowFilter)
function attachRowFilter(el: HTMLElement, scanBody: HTMLElement, placeholder: string, selectors: string[]): void {
  const controls = el.createDiv({ cls: "cc-pane-controls" });
  const input = controls.createEl("input", { cls: "cc-filter-input" });
  input.placeholder = placeholder;
  el.insertBefore(controls, el.firstChild);
  input.oninput = () => {
    const q = input.value.toLowerCase();
    for (const sel of selectors) {
      scanBody.querySelectorAll<HTMLElement>(sel).forEach((row) => {
        row.style.display = (row.textContent?.toLowerCase() ?? "").includes(q) ? "" : "none";
      });
    }
  };
}

export const scanWidget: WidgetSpec = {
  async render(el: HTMLElement, ctx: WidgetContext): Promise<void> {
    const folderPath = String(ctx.pane.folder ?? "");
    const files = scanFilesIn(ctx.app, folderPath);
    if (files.length === 0) {
      el.createEl("div", { text: `No data at ${folderPath}/ yet. Run the scheduled radar.`, cls: "cc-empty" });
      return;
    }
    const latest = files[0];
    const meta = metaFileLink(el, latest, ctx);
    if (files.length > 1) meta.createSpan({ text: `${files.length} total`, cls: "cc-muted" });

    let content: string;
    try {
      content = await ctx.app.vault.cachedRead(latest);
    } catch (err) {
      el.createEl("div", { text: `Read error: ${String(err)}`, cls: "cc-empty" });
      return;
    }

    const sections = parseScan(content);
    const scanBody = el.createDiv({ cls: "cc-scan-body" });

    if (sections.length === 0) {
      const pre = scanBody.createEl("pre", { cls: "cc-content" });
      pre.setText(stripFrontmatter(content).slice(0, 4000));
      return;
    }

    if (ctx.pane.tableControls === true) {
      const controls = el.createDiv({ cls: "cc-pane-controls" });
      const filter = controls.createEl("input", { cls: "cc-filter-input" });
      filter.placeholder = "filter rows (name, lang, desc)…";
      filter.oninput = () => {
        const q = filter.value.toLowerCase();
        scanBody.querySelectorAll<HTMLElement>(".cc-repo-row").forEach((row) => {
          const text = row.textContent?.toLowerCase() ?? "";
          row.style.display = text.includes(q) ? "" : "none";
        });
      };
      const sortBtn = controls.createEl("button", { text: "★ sort", cls: "cc-sort-btn" });
      let desc = true;
      sortBtn.onclick = () => {
        desc = !desc;
        sortBtn.textContent = desc ? "★ sort ↓" : "★ sort ↑";
        scanBody.querySelectorAll<HTMLElement>(".cc-repo-list").forEach((list) => {
          const items = Array.from(list.querySelectorAll<HTMLElement>(".cc-repo-row"));
          items.sort((a, b) => {
            const aN = parseInt(a.dataset.stars ?? "0", 10);
            const bN = parseInt(b.dataset.stars ?? "0", 10);
            return desc ? bN - aN : aN - bN;
          });
          for (const it of items) list.appendChild(it);
        });
      };
      controls.before(scanBody);
      el.appendChild(controls);
      el.appendChild(scanBody);
    }

    for (const sec of sections) {
      renderScanSection(scanBody, sec, ctx);
    }

    if (ctx.pane.rowFilter === true) {
      attachRowFilter(el, scanBody, "filter radar (CVE, KEP, release)…", [
        ".cc-cve-card", ".cc-kep-row", ".cc-release-row", ".cc-scan-list > li",
      ]);
    }
  },
};
