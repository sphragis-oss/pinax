#!/usr/bin/env node
// End-to-end verification of the pinax success criteria against the REAL bundled main.js,
// run headlessly with a mock Obsidian API (tests/harness/obsidian-mock.mjs).
import { createRequire } from "node:module";
import Module from "node:module";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as mock from "../tests/harness/obsidian-mock.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);

// intercept require("obsidian") from the CJS bundle
const origLoad = Module._load;
Module._load = function (request, ...rest) {
  if (request === "obsidian") return mock;
  return origLoad.call(this, request, ...rest);
};

mock.setupDom();

const consoleErrors = [];
const origConsoleError = console.error;
console.error = (...args) => { consoleErrors.push(args.map(String).join(" ")); origConsoleError(...args); };

let pass = 0, fail = 0;
function check(label, cond, detail = "") {
  if (cond) { pass++; console.log(`  ✔ ${label}`); }
  else { fail++; console.log(`  ✘ ${label}${detail ? ` - ${detail}` : ""}`); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, ms = 4000, step = 60) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await fn()) return true;
    await sleep(step);
  }
  return fn();
}

function seedVault(app) {
  const v = app.vault;
  const scan = [
    "---", "title: scan", "---", "",
    "## Releases (last 48h)",
    "- **argo-cd** -- [v3.2.1](https://example.com/argo) -- Argo CD (2026-07-01)",
    "- **cilium** -- [v1.18.0](https://example.com/cilium) -- Cilium (2026-07-02)",
    "",
    "## Security advisories (High+)",
    "- **GHSA-abcd-1234** [go] [runc container escape](https://example.com/cve)",
    "",
    "## Merged KEPs",
    "- 2026-07-01 -- KEP-1234: example enhancement",
  ].join("\n");
  v.putFile("raw/scans/2026-07-02.md", scan);
  const trending = [
    "## Top repos (7d)",
    "| # | Repo | Stars | Lang | Description |",
    "| - | ---- | ----- | ---- | ----------- |",
    "| 1 | [org/alpha](https://example.com/a) | 12.5k | Go | first repo |",
    "| 2 | [org/beta](https://example.com/b) | 9.1k | Rust | second repo |",
    "| 3 | [org/gamma](https://example.com/c) | 20.2k | Python | third repo |",
  ].join("\n");
  v.putFile("raw/scans/github-trending/2026-07-02.md", trending);
  v.putFile("raw/daily/2026-07-03.md", ["---", "title: d", "---", "## Follow-ups", "- [ ] review pinax", "- [x] ship harness"].join("\n"));
  v.putFile("projects/personal/pinax/README.md", "# pinax");
  v.putFile("projects/work/platform/README.md", "# platform");
  v.putFile("crm/contacts/Ada Lovelace.md", ["---", "name: Ada Lovelace", "company: Analytical Engines", "stage: qualified", "email: ada@example.com", "lastContact: 2026-06-30", "---", "## Notes"].join("\n"));
  v.putFile("crm/contacts/Grace Hopper.md", ["---", "name: Grace Hopper", "company: COBOL Inc", "stage: lead", "email: grace@example.com", "lastContact: 2026-07-01", "---", "## Notes"].join("\n"));
  v.putFile("reading/books/Dune.md", ["---", "name: Dune", "author: Frank Herbert", "status: reading", "rating: 5", "---", "## Review"].join("\n"));
  v.putFile("embed/welcome.md", "# Welcome\n\nembedded note body");
  v.putFile("photo/shoots/Acme Wedding.md", ["---", "client: Acme Wedding", "date: 2026-06-20", "location: Athens", "status: delivered", "fee: 1200", "---"].join("\n"));
  v.putFile("photo/invoicing.md", "# Invoicing checklist\n\n- [ ] send invoice");
  v.putFile("log.md", "# Log\n\n## Entries\n- 08:00 existing entry\n");
  const now = new Date();
  const isoOffset = (off) => {
    const d = new Date(now);
    d.setDate(d.getDate() + off);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };
  const localToday = isoOffset(0);
  v.putFile(`daily/${localToday}.md`, "# Today\n\ntemplating works");
  v.putFile("tags/one.md", ["---", "tags: habit, active", "---", "frontmatter-tagged"].join("\n"));
  v.putFile("notes-misc/two.md", "inline tagged #habit note");
  v.putFile("notes-misc/three.md", "unrelated #other note");
  v.putFile("events/recent.md", ["---", `date: ${isoOffset(-2)}`, "---"].join("\n"));
  v.putFile("events/old.md", ["---", "date: 2000-01-01", "---"].join("\n"));
  v.putFile("reading/books/Ubik.md", ["---", "name: Ubik", "author: Philip K. Dick", "status: finished", "rating: 4", `finished: ${isoOffset(-30)}`, "---"].join("\n"));
  v.putFile("actions/task-a.md", ["---", "name: task-a", "status: open", "---"].join("\n"));
  for (let i = 1; i <= 12; i++) {
    v.putFile(`bulk/items/item-${String(i).padStart(2, "0")}.md`, ["---", `name: item-${i}`, `rank: ${i}`, "---"].join("\n"));
  }
  v.putFile("raw/scans/platform/2026-07-02.md", [
    "---", "terraform_open: 4", "terraform_merged_7d: 9", "terraform_stale_14d: 2",
    "helm_charts: 120", "helm_commits_7d: 5", "k8s_clusters: 6", "k8s_degraded: 1", "---",
    "",
    "## Terraform",
    "| PR | Title | Atlantis |",
    "| -- | ----- | -------- |",
    "| [#1](https://example.com/1) | add bucket | plan ok |",
    "",
    "## Kubernetes",
    "| Cluster | Status |",
    "| ------- | ------ |",
    "| prod | ok |",
    "",
    "## Action items",
    "- merge #1",
  ].join("\n"));
}

async function bootPlugin(app) {
  const manifest = { id: "pinax", dir: ".obsidian/plugins/pinax", name: "Pinax", version: "0.1.0" };
  const PluginClass = require(resolve(root, "main.js")).default;
  const plugin = new PluginClass(app, manifest);
  await plugin.onload();
  await waitFor(() => plugin.profile !== null || plugin.profileErrors.length > 0);
  return plugin;
}

function viewRoot(plugin) {
  const leaf = plugin.app.workspace.getLeavesOfType("pinax-view")[0];
  return leaf?.view?.containerEl.children[1];
}

async function grantTrust(plugin, id, gates) {
  const trust = plugin.ensureTrust(id);
  for (const g of gates) trust[g] = true;
  await plugin.saveSettings();
  await plugin.reloadProfile();
}

const app = new mock.App();
seedVault(app);
const plugin = await bootPlugin(app);
await plugin.activate();
await waitFor(() => !!viewRoot(plugin)?.querySelector(".cc-grid"));

console.log("\n[1] build artifact loads; API exposed; no console errors");
check("plugin onload completed and view rendered", !!viewRoot(plugin));
check("window.pinax.apiVersion === 1", globalThis.window.pinax?.apiVersion === 1);

console.log("\n[2] sre profile reproduces the seed panes + skill row");
{
  check("active profile defaults to sre", plugin.settings.activeProfile === "sre");
  const rootEl = viewRoot(plugin);
  const titles = Array.from(rootEl.querySelectorAll(".cc-pane h3")).map((h) => h.textContent);
  check("CNCF / PLATFORM RADAR pane present", titles.some((t) => t.includes("CNCF / PLATFORM RADAR")));
  check("GITHUB TRENDING pane present", titles.some((t) => t.includes("GITHUB TRENDING")));
  check("PROJECTS pane present", titles.some((t) => t.includes("PROJECTS")));
  check("seed pane count (8 framed panes)", rootEl.querySelectorAll(".cc-pane").length === 8, `got ${rootEl.querySelectorAll(".cc-pane").length}`);
  check("scan sections render with seed markup", rootEl.querySelectorAll(".cc-scan-section").length >= 3);
  check("CVE card renders", !!rootEl.querySelector(".cc-cve-card .cc-cve-id"));
  check("KEP row renders", !!rootEl.querySelector(".cc-kep-row .cc-kep-id"));
  check("release rows render", rootEl.querySelectorAll(".cc-release-row").length === 2);
  check("trending repo rows render", rootEl.querySelectorAll(".cc-repo-row").length === 3);
  check("projects grouped with scope labels", !!rootEl.querySelector(".cc-proj-scope-work"));
  check("open tasks render from daily note", rootEl.querySelectorAll(".cc-task").length === 2);
  check("skill row gated OFF by default -> placeholder",
    !rootEl.querySelector(".cc-skill-row") && !!rootEl.querySelector(".px-bare .px-placeholder"));
  await grantTrust(plugin, "sre", ["command"]);
  await waitFor(() => !!viewRoot(plugin).querySelector(".cc-skill-row"));
  const btns = Array.from(viewRoot(plugin).querySelectorAll(".cc-skill-btn .cc-skill-label")).map((e) => e.textContent);
  check("skill row renders 6 seed buttons when command trust enabled",
    btns.length === 6 && btns[0] === "Daily Note" && btns.includes("Graphify"), btns.join(","));
  const btn = viewRoot(plugin).querySelector(".cc-skill-btn");
  btn.onclick();
  await sleep(20);
  check("skill button copies command (never executes)", mock.clipboard.last === "claude /daily-note", String(mock.clipboard.last));
}

console.log("\n[3] hot-reload + Settings live pane edits");
{
  const p = ".obsidian/plugins/pinax/profiles/sre/profile.json";
  const text = await app.vault.adapter.read(p);
  await app.vault.adapter.write(p, text.replace("⬢ CNCF / PLATFORM RADAR", "⬢ HOT-RELOADED RADAR"));
  const reloaded = await waitFor(() => viewRoot(plugin)?.textContent.includes("HOT-RELOADED RADAR"), 6000);
  check("editing profile.json hot-reloads the dashboard (no rebuild)", reloaded);

  mock.settingControls.length = 0;
  const tab = plugin.__settingTab;
  tab.display();
  await waitFor(() => mock.settingControls.some((c) => c.setting.startsWith("1.")));
  const firstTitleBefore = viewRoot(plugin).querySelector(".cc-pane h3").textContent;
  const down = mock.settingControls.find((c) => c.setting.startsWith("2.") && c.kind === "extra" && c.control.__icon === "arrow-down");
  check("settings pane editor lists panes with reorder controls", !!down);
  await down.control.__onClick();
  await waitFor(async () => {
    const t = await app.vault.adapter.read(p);
    return JSON.parse(t).panes[2].title?.includes("HOT-RELOADED RADAR");
  });
  const after = JSON.parse(await app.vault.adapter.read(p));
  check("settings reorder persisted to profile.json", after.panes[2].title?.includes("HOT-RELOADED RADAR"), JSON.stringify(after.panes.map((x) => x.title)));
  await waitFor(() => viewRoot(plugin).querySelector(".cc-pane h3").textContent !== firstTitleBefore, 6000);
  check("dashboard re-rendered live after settings edit", viewRoot(plugin).querySelector(".cc-pane h3").textContent !== firstTitleBefore);

  mock.settingControls.length = 0;
  tab.display();
  await waitFor(() => mock.settingControls.some((c) => c.setting === "Add pane"));
  const addBtn = mock.settingControls.find((c) => c.setting === "Add pane" && c.kind === "button");
  await addBtn.control.__onClick();
  await waitFor(async () => JSON.parse(await app.vault.adapter.read(p)).panes.length === 10);
  check("settings Add pane appends a pane", JSON.parse(await app.vault.adapter.read(p)).panes.length === 10);
  mock.settingControls.length = 0;
  tab.display();
  await waitFor(() => mock.settingControls.some((c) => c.setting.startsWith("10.")));
  const del = mock.settingControls.find((c) => c.setting.startsWith("10.") && c.control.__icon === "trash");
  await del.control.__onClick();
  await waitFor(async () => JSON.parse(await app.vault.adapter.read(p)).panes.length === 9);
  check("settings Remove pane deletes it", JSON.parse(await app.vault.adapter.read(p)).panes.length === 9);
}

console.log("\n[4+9] all 11 widget types render; gates off -> placeholder, on -> works");
{
  const kitchen = {
    schemaVersion: 1,
    name: "Kitchen Sink",
    layout: "grid",
    panes: [
      { type: "folder-latest", title: "K1 LATEST", folder: "raw/scans" },
      { type: "folder-list", title: "K2 LIST", folder: "projects" },
      { type: "markdown-embed", title: "K3 EMBED", note: "embed/welcome.md" },
      { type: "table", title: "K4 TABLE", width: "full", source: { folder: "crm/contacts" }, columns: ["name", "company", "stage"], sort: { by: "name", dir: "asc" } },
      { type: "form", title: "K5 FORM", target: { folder: "crm/contacts" }, fields: [{ name: "name", required: true }, { name: "stage", type: "select", options: ["lead", "won"] }] },
      { type: "command-buttons", title: "K6 CMD", buttons: [{ label: "Echo", command: "echo hi" }] },
      { type: "iframe", title: "K7 WEB", url: "https://example.com" },
      { type: "custom", title: "K8 CUSTOM", widget: "demo.hello" },
      { type: "custom", title: "K9 UNKNOWN", widget: "nobody.registered.this" },
      { type: "form", title: "K10 APPEND", target: { note: "log.md", section: "## Entries", template: "- {{time}} {{what}}" }, fields: [{ name: "what", required: true }] },
      { type: "table", title: "K11 PAGED", width: "full", source: { folder: "bulk/items" }, columns: ["name", "rank"], sort: { by: "rank", dir: "asc" }, pageSize: 10, filter: false },
      { type: "markdown-embed", title: "K12 TODAY", note: "daily/{{today}}.md" },
      { type: "heatmap", title: "K13 HEAT", source: { folder: "bulk/items" }, weeks: 8 },
      { type: "board", title: "K14 BOARD", width: "full", source: { folder: "crm/contacts" }, groupBy: "stage", columns: ["lead", "qualified", "won"], cardFields: ["company"], actions: [{ label: "win", set: { stage: "won" } }] },
      { type: "stat", title: "K15 STAT", source: { folder: "bulk/items" }, agg: "sum", field: "rank", label: "total rank", sparkline: true },
      { type: "table", title: "K16 WHERE", width: "full", source: { folder: "crm/contacts", where: [{ field: "stage", is: "lead" }] }, columns: ["name"], filter: false },
      { type: "stat", title: "K17 WARN", source: { folder: "bulk/items" }, agg: "sum", field: "rank", warn: { above: 50 } },
      { type: "table", title: "K18 TAGS", width: "full", source: { tags: ["#habit"] }, columns: ["name"], filter: false },
      { type: "table", title: "K19 RECENT", width: "full", source: { folder: "events", where: [{ field: "date", after: "{{today-7d}}" }] }, columns: ["name"], filter: false },
      { type: "table", title: "K20 ACTIONS", width: "full", source: { folder: "actions" }, columns: ["name", "status"], filter: false, actions: [{ label: "done", set: { status: "done", closed: "{{today}}" } }] },
      { type: "form", title: "K21 CAPTURE", target: { note: "inbox/{{today}}.md", section: "## Log" }, fields: [{ name: "quick" }] },
    ],
  };
  await app.vault.adapter.mkdir(".obsidian/plugins/pinax/profiles/kitchen");
  await app.vault.adapter.write(".obsidian/plugins/pinax/profiles/kitchen/profile.json", JSON.stringify(kitchen, null, 2));
  await plugin.setActiveProfile("kitchen");
  await waitFor(() => viewRoot(plugin)?.textContent.includes("K1 LATEST"));
  let rootEl = viewRoot(plugin);
  check("folder-latest renders newest note", rootEl.textContent.includes("2026-07-02.md"));
  check("folder-list renders entries with counts", /personal\/.*files/s.test(rootEl.textContent));
  check("markdown-embed renders note body", rootEl.textContent.includes("embedded note body"));
  check("table renders records as rows", rootEl.querySelectorAll(".px-table tbody tr").length >= 2);
  const firstCell = rootEl.querySelector(".px-table tbody tr td").textContent;
  check("table sorted asc by config", firstCell === "Ada Lovelace", firstCell);
  const gatedPlaceholders = rootEl.querySelectorAll(".px-placeholder").length;
  check("form/command/iframe gated off -> placeholders + unknown custom placeholder", gatedPlaceholders >= 5, String(gatedPlaceholders));
  check("unknown custom widget shows friendly placeholder, no crash", rootEl.textContent.includes('"nobody.registered.this" not registered'));
  check("{{today}} path token resolves in markdown-embed", rootEl.textContent.includes("templating works"));
  check("heatmap renders day cells", rootEl.querySelectorAll(".px-heat").length >= 8 * 7 && !!rootEl.querySelector(".px-heat-4"));
  check("heatmap meta counts notes and streak", /12 notes · 1 active days · streak/.test(rootEl.querySelector(".px-heat-meta")?.textContent ?? ""), rootEl.querySelector(".px-heat-meta")?.textContent);
  const boardCols = Array.from(rootEl.querySelectorAll(".px-board .px-pipeline-col"));
  check("board renders explicit columns incl. empty ones", boardCols.length === 3, String(boardCols.length));
  check("board cards show name + cardFields", boardCols.some((c) => c.textContent.includes("Ada Lovelace") && c.textContent.includes("Analytical Engines")));
  check("stat aggregates numeric frontmatter (sum rank = 78)", rootEl.querySelector(".px-stat-value")?.textContent === "78", rootEl.querySelector(".px-stat-value")?.textContent);
  check("stat sparkline svg renders", !!rootEl.querySelector(".px-stat-spark"));
  const whereWrap = Array.from(rootEl.querySelectorAll(".px-table-wrap")).find((w) => w.closest(".cc-pane")?.textContent.includes("K16 WHERE"));
  check("where filter keeps only matching records", whereWrap?.querySelectorAll("tbody tr").length === 1 && whereWrap.textContent.includes("Grace Hopper"), String(whereWrap?.querySelectorAll("tbody tr").length));
  check("stat warn threshold colors the value", !!rootEl.querySelector(".px-stat-warn"));
  const tagsWrap = Array.from(rootEl.querySelectorAll(".px-table-wrap")).find((w) => w.closest(".cc-pane")?.textContent.includes("K18 TAGS"));
  check("tag source finds frontmatter + inline tags across folders",
    tagsWrap?.querySelectorAll("tbody tr").length === 2 && tagsWrap.textContent.includes("one") && tagsWrap.textContent.includes("two"),
    String(tagsWrap?.querySelectorAll("tbody tr").length));
  const recentWrap = Array.from(rootEl.querySelectorAll(".px-table-wrap")).find((w) => w.closest(".cc-pane")?.textContent.includes("K19 RECENT"));
  check("rolling-date where keeps only recent records",
    recentWrap?.querySelectorAll("tbody tr").length === 1 && recentWrap.textContent.includes("recent"),
    String(recentWrap?.querySelectorAll("tbody tr").length));
  check("action buttons hidden while write trust off", !rootEl.querySelector(".px-action-btn"));

  // register demo.hello via the shipped external example, exercising window.pinax
  const demoSrc = readFileSync(resolve(root, "examples/demo-widget.js"), "utf8");
  (0, eval)(demoSrc);
  await waitFor(() => viewRoot(plugin)?.textContent.includes("hello from demo.hello"));
  rootEl = viewRoot(plugin);
  check("demo.hello registered via window.pinax renders in custom pane", rootEl.textContent.includes("hello from demo.hello"));

  await grantTrust(plugin, "kitchen", ["web", "command", "write"]);
  await waitFor(() => !!viewRoot(plugin)?.querySelector(".px-iframe"));
  rootEl = viewRoot(plugin);
  check("iframe renders when web enabled", rootEl.querySelector(".px-iframe")?.src === "https://example.com/");
  check("command-buttons render when command enabled", !!rootEl.querySelector(".cc-skill-btn"));
  check("form renders when write enabled", !!rootEl.querySelector(".px-form"));

  // pagination
  const pagedWrap = Array.from(rootEl.querySelectorAll(".px-table-wrap")).find((w) => w.textContent.includes("item-01"));
  check("paged table shows pageSize rows", pagedWrap.querySelectorAll("tbody tr").length === 10, String(pagedWrap.querySelectorAll("tbody tr").length));
  const moreBtn = pagedWrap.querySelector(".px-table-more");
  check("paged table offers show-more", !!moreBtn && moreBtn.textContent.includes("2 hidden"), moreBtn?.textContent);
  moreBtn.onclick();
  await sleep(10);
  check("show-more reveals remaining rows", viewRoot(plugin).querySelectorAll(".px-table-wrap")[1]?.closest ? Array.from(viewRoot(plugin).querySelectorAll(".px-table-wrap")).find((w) => w.textContent.includes("item-12"))?.querySelectorAll("tbody tr").length === 12 : false);

  // table sorting interaction
  const contactsWrap = Array.from(viewRoot(plugin).querySelectorAll(".px-table-wrap")).find((w) => w.textContent.includes("Ada Lovelace"));
  const nameTh = Array.from(contactsWrap.querySelectorAll("th")).find((th) => th.textContent.startsWith("name"));
  nameTh.onclick();
  await sleep(10);
  const contactsWrap2 = Array.from(viewRoot(plugin).querySelectorAll(".px-table-wrap")).find((w) => w.textContent.includes("Lovelace"));
  const firstAfter = contactsWrap2.querySelector("tbody tr td").textContent;
  check("table header click re-sorts rows", firstAfter === "Grace Hopper", firstAfter);

  // create form
  const createForm = Array.from(viewRoot(plugin).querySelectorAll(".px-form")).find((f) => !f.textContent.includes("what"));
  createForm.querySelector(".px-form-input").value = "Alan Turing";
  createForm.dispatchEvent(new globalThis.window.Event("submit", { cancelable: true }));
  const created = await waitFor(() => app.vault.store.has("crm/contacts/Alan Turing.md"));
  check("form submit creates a frontmatter note in target folder", created);
  if (created) {
    const note = await app.vault.adapter.read("crm/contacts/Alan Turing.md");
    check("created note has frontmatter fields", note.includes("name: Alan Turing") && note.startsWith("---"));
  }

  // append form
  const appendForm = Array.from(viewRoot(plugin).querySelectorAll(".px-form")).find((f) => f.textContent.includes("what"));
  appendForm.querySelector(".px-form-input").value = "wrote harness checks";
  appendForm.dispatchEvent(new globalThis.window.Event("submit", { cancelable: true }));
  const appended = await waitFor(async () => (await app.vault.adapter.read("log.md")).includes("wrote harness checks"));
  check("append form adds templated line under section", appended);
  if (appended) {
    const log = await app.vault.adapter.read("log.md");
    check("append lands under the section heading", /## Entries\n- \d\d:\d\d wrote harness checks\n- 08:00 existing entry/.test(log), JSON.stringify(log));
  }

  // board drag & drop (write trust already granted)
  const boardEl = viewRoot(plugin).querySelector(".px-board");
  const dragCards = Array.from(boardEl.querySelectorAll(".px-pipeline-card"));
  check("board cards draggable once write trust granted", dragCards.length > 0 && dragCards.every((c) => c.draggable === true));
  const leadCol = Array.from(boardEl.querySelectorAll(".px-pipeline-col")).find((c) => c.querySelector(".px-pipeline-head")?.textContent.includes("lead"));
  leadCol.ondrop({ preventDefault() {}, dataTransfer: { getData: () => "crm/contacts/Ada Lovelace.md" } });
  const dropped = await waitFor(async () => (await app.vault.adapter.read("crm/contacts/Ada Lovelace.md")).includes("stage: lead"));
  check("board drop rewrites groupBy frontmatter", dropped);
  if (dropped) {
    const ada = await app.vault.adapter.read("crm/contacts/Ada Lovelace.md");
    check("board drop keeps other frontmatter + body", ada.includes("company: Analytical Engines") && ada.includes("## Notes"));
  }

  // heatmap click-through
  await waitFor(() => !!viewRoot(plugin).querySelector(".px-heat-4"));
  const openedBefore = app.workspace.opened.length;
  viewRoot(plugin).querySelector(".px-heat-4").onclick();
  check("heatmap day with notes opens the newest note on click",
    app.workspace.opened.length === openedBefore + 1 && app.workspace.opened.at(-1).startsWith("bulk/items/"),
    app.workspace.opened.at(-1));
  const emptyCell = Array.from(viewRoot(plugin).querySelectorAll(".px-heat-0")).find((c) => typeof c.onclick === "function");
  check("heatmap empty day offers create when write trusted", !!emptyCell && emptyCell.title.includes("click to create"), emptyCell?.title);
  if (emptyCell) {
    const day = emptyCell.title.split(":")[0];
    emptyCell.onclick();
    const createdDay = await waitFor(() => app.vault.store.has(`bulk/items/${day}.md`));
    check("heatmap empty day click creates the day note", createdDay, `bulk/items/${day}.md`);
  }

  // action buttons (write trust granted above)
  await waitFor(() => !!viewRoot(plugin).querySelector(".px-action-btn"), 6000);
  const actionBtn = Array.from(viewRoot(plugin).querySelectorAll(".px-action-btn")).find((b) => b.textContent === "done");
  check("table action buttons render with write trust", !!actionBtn);
  actionBtn.onclick({ stopPropagation() {} });
  const acted = await waitFor(async () => (await app.vault.adapter.read("actions/task-a.md")).includes("status: done"));
  check("action click rewrites frontmatter fields", acted);
  if (acted) {
    const t = await app.vault.adapter.read("actions/task-a.md");
    check("action set expands {{today}} token", /closed: \d{4}-\d{2}-\d{2}/.test(t), t);
    const undoBtn = mock.Notice.last?.noticeEl?.querySelector("button");
    check("mutation notice offers Undo", undoBtn?.textContent === "Undo");
    undoBtn.onclick();
    const undone = await waitFor(async () => {
      const s = await app.vault.adapter.read("actions/task-a.md");
      return s.includes("status: open") && !s.includes("closed:");
    });
    check("undo restores previous frontmatter (incl. deleting added fields)", undone, await app.vault.adapter.read("actions/task-a.md"));
  }
  check("board cards show action buttons",
    Array.from(viewRoot(plugin).querySelectorAll(".px-pipeline-card .px-action-btn")).some((b) => b.textContent === "win"));

  // quick capture: append auto-creates the missing daily note
  const captureForm = Array.from(viewRoot(plugin).querySelectorAll(".px-form")).find((f) => f.textContent.includes("quick"));
  captureForm.querySelector(".px-form-input").value = "quick capture works";
  captureForm.dispatchEvent(new globalThis.window.Event("submit", { cancelable: true }));
  const nowD = new Date();
  const todayIso = `${nowD.getFullYear()}-${String(nowD.getMonth() + 1).padStart(2, "0")}-${String(nowD.getDate()).padStart(2, "0")}`;
  const captured = await waitFor(() => app.vault.store.has(`inbox/${todayIso}.md`));
  check("form append auto-creates the missing target note", captured, `inbox/${todayIso}.md`);
  if (captured) {
    const note = await app.vault.adapter.read(`inbox/${todayIso}.md`);
    check("auto-created note carries section + entry", note.includes("## Log") && note.includes("quick capture works"), JSON.stringify(note));
  }

  // live refresh: editing a displayed note re-renders without manual refresh
  const adaRaw = await app.vault.adapter.read("crm/contacts/Ada Lovelace.md");
  app.vault.putFile("crm/contacts/Ada Lovelace.md", adaRaw.replace("Analytical Engines", "Lovelace Labs"));
  const liveRefreshed = await waitFor(() => viewRoot(plugin)?.textContent.includes("Lovelace Labs"), 6000);
  check("vault edit live-refreshes the dashboard (debounced, no manual refresh)", liveRefreshed);

  // mobile fallback: no HTML5 drag on touch, so cards get a move menu
  mock.Platform.isMobile = true;
  await plugin.app.workspace.getLeavesOfType("pinax-view")[0].view.render();
  const adaCard = Array.from(viewRoot(plugin).querySelectorAll(".px-pipeline-card")).find((c) => c.textContent.includes("Ada Lovelace"));
  const moveBtn = adaCard?.querySelector(".px-board-move");
  check("mobile board cards show a move button", !!moveBtn);
  moveBtn.onclick({ stopPropagation() {} });
  const menu = mock.Menu.last;
  check("move menu lists the other columns", menu.items.some((i) => i.title === "won") && !menu.items.some((i) => i.title === "lead"), menu.items.map((i) => i.title).join(","));
  menu.items.find((i) => i.title === "won").__onClick();
  const movedMobile = await waitFor(async () => (await app.vault.adapter.read("crm/contacts/Ada Lovelace.md")).includes("stage: won"));
  check("move menu rewrites groupBy like drag & drop", movedMobile);
  mock.Platform.isMobile = false;
  await plugin.app.workspace.getLeavesOfType("pinax-view")[0].view.render();
}

console.log("\n[per-profile trust]");
{
  check("kitchen trust did not leak to sre", plugin.settings.profileTrust.sre.write !== true && plugin.settings.profileTrust.kitchen.write === true);
  await plugin.setActiveProfile("reading");
  await waitFor(() => viewRoot(plugin)?.textContent.includes("LIBRARY"));
  check("reading form gated despite kitchen's write trust", !viewRoot(plugin).querySelector(".px-form") && !!viewRoot(plugin).querySelector(".px-placeholder"));
}

console.log("\n[5] reading profile is a working bookshelf");
{
  const rootEl0 = viewRoot(plugin);
  check("library table renders", rootEl0.querySelectorAll(".px-table tbody tr").length >= 2);
  check("shelf custom widget renders shelf columns", rootEl0.querySelectorAll(".px-pipeline-col").length >= 3);
  check("shelf cards show author + rating stars", Array.from(rootEl0.querySelectorAll(".px-pipeline-sub")).some((s) => s.textContent.includes("Frank Herbert") && s.textContent.includes("★★★★★")));
  const statVals = Array.from(rootEl0.querySelectorAll(".px-stat-value")).map((s) => s.textContent);
  check("finished-last-12-months stat counts via rolling-date where", statVals.includes("1"), statVals.join(","));
  check("avg rating stat aggregates finished books", statVals.includes("4"), statVals.join(","));
  await grantTrust(plugin, "reading", ["write"]);
  await waitFor(() => !!viewRoot(plugin)?.querySelector(".px-form"));
  check("add-book form renders once reading gets write trust", !!viewRoot(plugin).querySelector(".px-form"));
}

console.log("\n[widget cleanup lifecycle]");
{
  let cleanups = 0;
  globalThis.window.pinax.registerWidget("test.cleanup", {
    render(el) {
      el.createDiv({ text: "cleanup test widget" });
      return () => { cleanups++; };
    },
  });
  const p = ".obsidian/plugins/pinax/profiles/reading/profile.json";
  const readingProfile = JSON.parse(await app.vault.adapter.read(p));
  readingProfile.panes.push({ type: "custom", widget: "test.cleanup", title: "CLEANUP" });
  await app.vault.adapter.write(p, JSON.stringify(readingProfile, null, 2));
  await waitFor(() => viewRoot(plugin)?.textContent.includes("cleanup test widget"), 6000);
  const before = cleanups;
  const leaf = plugin.app.workspace.getLeavesOfType("pinax-view")[0];
  await leaf.view.render();
  check("cleanup runs before re-render", cleanups === before + 1, `before=${before} after=${cleanups}`);
  readingProfile.panes.pop();
  await app.vault.adapter.write(p, JSON.stringify(readingProfile, null, 2));
  await waitFor(() => !viewRoot(plugin)?.textContent.includes("cleanup test widget"), 6000);
  globalThis.window.pinax.unregisterWidget("test.cleanup");
}

console.log("\n[widgets.js code gate]");
{
  const widgetsSrc = readFileSync(resolve(root, "examples/widgets-file-example.js"), "utf8")
    .replace(/myprofile\.counter/g, "gadgets.counter");
  const gadgets = {
    schemaVersion: 1,
    name: "Gadgets",
    layout: "grid",
    panes: [{ type: "custom", widget: "gadgets.counter", title: "COUNTER", config: { folder: "crm/contacts" } }],
  };
  await app.vault.adapter.mkdir(".obsidian/plugins/pinax/profiles/gadgets");
  await app.vault.adapter.write(".obsidian/plugins/pinax/profiles/gadgets/profile.json", JSON.stringify(gadgets, null, 2));
  await app.vault.adapter.write(".obsidian/plugins/pinax/profiles/gadgets/widgets.js", widgetsSrc);
  await plugin.setActiveProfile("gadgets");
  await waitFor(() => viewRoot(plugin)?.textContent.includes("COUNTER"));
  check("widgets.js inert while code trust off -> placeholder", viewRoot(plugin).textContent.includes('"gadgets.counter" not registered'));
  await grantTrust(plugin, "gadgets", ["code"]);
  await waitFor(() => viewRoot(plugin)?.textContent.includes("entries in crm/contacts/"), 6000);
  check("widgets.js widget renders once code trust enabled", viewRoot(plugin).textContent.includes("entries in crm/contacts/"));

  const bundlePath = await plugin.store.exportBundle("gadgets");
  const bundle = JSON.parse(await app.vault.adapter.read(bundlePath));
  check("export bundle carries widgets.js", typeof bundle.widgets === "string" && bundle.widgets.includes("gadgets.counter"));
}

console.log("\n[helm profile: full seed parity tabs]");
{
  await plugin.setActiveProfile("helm");
  await waitFor(() => viewRoot(plugin)?.querySelector(".cc-tabs"));
  const rootEl = viewRoot(plugin);
  const tabs = Array.from(rootEl.querySelectorAll(".cc-tab")).map((t) => t.textContent);
  check("5 seed tabs render", tabs.join(",") === "OVERVIEW,OPS,STANDUP,REPORTS,SYSTEM", tabs.join(","));
  check("hero renders (logo + specs)", !!rootEl.querySelector(".cc-hero__neofetch") && rootEl.textContent.includes("ClaudeVault"));
  check("hero probes gated while web off", rootEl.textContent.includes("web disabled in Settings"));
  check("alert bar renders", !!rootEl.querySelector(".cc-alert-bar"));
  check("overview panes render inside tab", Array.from(rootEl.querySelectorAll(".cc-pane h3")).some((h) => h.textContent.includes("CNCF / PLATFORM RADAR")));

  const opsTab = Array.from(rootEl.querySelectorAll(".cc-tab")).find((t) => t.textContent === "OPS");
  opsTab.onclick();
  await waitFor(() => viewRoot(plugin)?.textContent.includes("PLATFORM · terraform / helm / kubernetes"), 6000);
  const opsRoot = viewRoot(plugin);
  check("ops tab renders platform section label", opsRoot.textContent.includes("PLATFORM · terraform / helm / kubernetes"));
  check("platform metric tiles parsed from frontmatter", opsRoot.textContent.includes("TF OPEN") && opsRoot.textContent.includes("HELM CHARTS"));
  check("platform tables render with status pills", !!opsRoot.querySelector(".cc-platform-pill-ok"));
  check("reliability shows empty state (no scans seeded)", opsRoot.textContent.includes("No reliability scans yet"));

  const sysTab = Array.from(viewRoot(plugin).querySelectorAll(".cc-tab")).find((t) => t.textContent === "SYSTEM");
  sysTab.onclick();
  await waitFor(() => viewRoot(plugin)?.textContent.includes("MCP"), 6000);
  const sysRoot = viewRoot(plugin);
  check("system tab: services pane gated behind command", sysRoot.textContent.includes('"command" capability'));
  check("system tab: mcp empty state renders", sysRoot.textContent.includes("No audit reports yet"));
  check("system tab: usage pane renders (desktop-degraded ok)", sysRoot.textContent.includes("USAGE") || sysRoot.textContent.includes("No local sessions"));
}

console.log("\n[command palette]");
{
  const rootEl = viewRoot(plugin);
  const cmdkBtn = Array.from(rootEl.querySelectorAll(".cc-theme-btn")).find((b) => b.textContent === "⌘K");
  cmdkBtn.onclick();
  await waitFor(() => !!viewRoot(plugin).querySelector(".cc-cmdk-overlay"));
  const items = Array.from(viewRoot(plugin).querySelectorAll(".cc-cmdk-item .cc-cmdk-label")).map((e) => e.textContent);
  check("palette opens with tab/profile/theme/note items",
    items.some((i) => i.startsWith("Go to ")) && items.some((i) => i.startsWith("Switch profile:")) && items.some((i) => i.startsWith("Theme:")),
    items.slice(0, 5).join(","));
  viewRoot(plugin).querySelector(".cc-cmdk-overlay").remove();
}

console.log("\n[onboarding + deep links + duplicate profile]");
{
  plugin.settings.activeProfile = "";
  await plugin.reloadProfile();
  await waitFor(() => !!viewRoot(plugin)?.querySelector(".px-onboard"));
  const btns = Array.from(viewRoot(plugin).querySelector(".px-onboard").querySelectorAll(".px-btn"));
  check("onboarding picker lists available profiles", btns.length >= 3 && btns.some((b) => b.textContent === "reading"), btns.map((b) => b.textContent).join(","));
  btns.find((b) => b.textContent === "reading").onclick();
  const picked = await waitFor(() => plugin.settings.activeProfile === "reading" && viewRoot(plugin)?.textContent.includes("LIBRARY"));
  check("onboarding pick activates the profile", picked);

  const handler = plugin.__protocolHandlers?.pinax;
  check("obsidian://pinax protocol handler registered", typeof handler === "function");
  handler({ profile: "helm" });
  const linked = await waitFor(() => plugin.settings.activeProfile === "helm");
  check("deep link with ?profile= switches profile", linked);

  await plugin.store.duplicate("reading", "reading-copy");
  check("duplicate copies profile.json under the new id", await app.vault.adapter.exists(".obsidian/plugins/pinax/profiles/reading-copy/profile.json"));
  check("duplicated profile starts with zero trust", plugin.settings.profileTrust["reading-copy"] === undefined);
  let dupErr = "";
  await plugin.store.duplicate("reading", "reading-copy").catch((e) => { dupErr = String(e); });
  check("duplicate refuses an existing id", dupErr.includes("already exists"), dupErr);

  const diagCmd = plugin.__commands.find((c) => c.id === "copy-diagnostics");
  check("copy-diagnostics command registered", !!diagCmd);
  diagCmd.callback();
  const gotDiag = await waitFor(() => typeof mock.clipboard.last === "string" && mock.clipboard.last.includes('"activeProfile"'));
  let diagOk = false;
  try {
    const d = JSON.parse(mock.clipboard.last);
    diagOk = d.plugin.startsWith("pinax") && Array.isArray(d.profiles) && typeof d.trust === "object" && typeof d.paneTypes === "object";
  } catch { /* leave false */ }
  check("diagnostics JSON lands on clipboard with the right shape", gotDiag && diagOk, String(mock.clipboard.last).slice(0, 120));
}

console.log("\n[6] public API behaviors");
{
  const api = globalThis.window.pinax;
  check("registerWidget/unregisterWidget exposed", typeof api.registerWidget === "function" && typeof api.unregisterWidget === "function");
  const latest = api.vault.latestInFolder("raw/scans");
  check("vault.latestInFolder returns newest TFile", latest?.name === "2026-07-02.md");
  check("vault.listFolder lists entries", api.vault.listFolder("projects").length === 2);
  const recs = await api.vault.records("crm/contacts");
  check("vault.records returns frontmatter records", recs.length >= 3 && recs.every((r) => r.fields.name));
  const content = await api.vault.readNote("embed/welcome.md");
  check("vault.readNote reads a note", content.includes("Welcome"));
  let escaped = false;
  try { await api.vault.readNote("../secrets.md"); } catch { escaped = true; }
  check("path escape rejected by API", escaped);
  let gated = false;
  try { await api.vault.createNote("crm/contacts", "", { name: "Blocked" }); } catch { gated = true; }
  check("createNote rejected while active profile lacks write", gated && !app.vault.store.has("crm/contacts/Blocked.md"));
  await grantTrust(plugin, "helm", ["write"]);
  const f = await api.vault.createNote("crm/contacts", "body {{name}}", { name: "Katherine Johnson", stage: "won" });
  check("createNote creates gated note when enabled", f?.path === "crm/contacts/Katherine Johnson.md");
  plugin.ensureTrust("helm").command = false;
  let cmdGated = false;
  try { await api.runCommand("echo hi"); } catch { cmdGated = true; }
  check("runCommand rejected while command disabled", cmdGated);
}

console.log("\n[7] LLM-generated profiles load unedited");
{
  const gen = readFileSync(resolve(root, "tests/fixtures/generated-profile.json"), "utf8");
  await app.vault.adapter.mkdir(".obsidian/plugins/pinax/profiles/genbooks");
  await app.vault.adapter.write(".obsidian/plugins/pinax/profiles/genbooks/profile.json", gen);
  await plugin.setActiveProfile("genbooks");
  await waitFor(() => viewRoot(plugin)?.textContent.includes("BOOKS"));
  const rootEl = viewRoot(plugin);
  check("generated profile renders table pane", rootEl.querySelectorAll(".px-table tbody tr").length === 2);
  check("generated profile renders form pane (gated)", rootEl.textContent.includes("ADD BOOK"));
  check("generated profile renders folder-latest pane", rootEl.textContent.includes("Dune.md"));

  const shoots = readFileSync(resolve(root, "tests/fixtures/e2e-shoots-profile.json"), "utf8");
  await app.vault.adapter.mkdir(".obsidian/plugins/pinax/profiles/shoots");
  await app.vault.adapter.write(".obsidian/plugins/pinax/profiles/shoots/profile.json", shoots);
  await plugin.setActiveProfile("shoots");
  await waitFor(() => viewRoot(plugin)?.textContent.includes("SHOOTS"));
  const shootsRoot = viewRoot(plugin);
  check("build-your-pinax output loads: shoots table renders", shootsRoot.querySelectorAll(".px-table tbody tr").length === 1);
  check("build-your-pinax output loads: embed renders", shootsRoot.textContent.includes("Invoicing checklist"));
}

console.log("\n[8] export -> import into a clean vault renders");
{
  const bundlePath = await plugin.store.exportBundle("reading");
  const bundleText = await app.vault.adapter.read(bundlePath);
  check("export produces a bundle file", bundleText.includes('"pinaxBundle": 1'));

  const cleanApp = new mock.App();
  cleanApp.vault.putFile("reading/books/Neuromancer.md", ["---", "name: Neuromancer", "author: Gibson", "status: done", "---"].join("\n"));
  const cleanPlugin = await bootPlugin(cleanApp);
  const importedId = await cleanPlugin.store.importBundle(bundleText);
  await cleanPlugin.setActiveProfile(importedId);
  await cleanPlugin.activate();
  await waitFor(() => viewRoot(cleanPlugin)?.textContent.includes("LIBRARY"));
  const rootEl = viewRoot(cleanPlugin);
  check("imported profile renders in the clean vault", rootEl.textContent.includes("LIBRARY") && rootEl.textContent.includes("Neuromancer"));
  check("imported profile starts with zero trust", cleanPlugin.activeTrust().write === false && cleanPlugin.activeTrust().code === false);

  // widgets.js bundle round-trip into the clean vault
  const gadgetBundle = await plugin.store.exportBundle("gadgets");
  const gid = await cleanPlugin.store.importBundle(await app.vault.adapter.read(gadgetBundle));
  check("bundle import writes widgets.js", await cleanApp.vault.adapter.exists(`.obsidian/plugins/pinax/profiles/${gid}/widgets.js`));
  cleanPlugin.onunload();
}

console.log("\n[mobile simulation: bundle loads without node builtins]");
{
  mock.Platform.isDesktopApp = false;
  mock.Platform.isMobile = true;
  mock.Platform.isMobileApp = true;
  mock.Platform.isMacOS = false;
  const mobileApp = new mock.App();
  mobileApp.vault.putFile("notes/hello.md", "# hi\n");
  const mobilePlugin = await bootPlugin(mobileApp);
  await mobilePlugin.setActiveProfile("helm");
  await mobilePlugin.activate();
  await waitFor(() => !!viewRoot(mobilePlugin)?.querySelector(".cc-tabs"), 6000);
  check("plugin boots and helm renders with mobile Platform flags", !!viewRoot(mobilePlugin)?.querySelector(".cc-hero__neofetch"));
  check("hero usage row degrades to desktop-only note", viewRoot(mobilePlugin).textContent.includes("desktop only"));
  mobilePlugin.onunload();
  mock.Platform.isDesktopApp = true;
  mock.Platform.isMobile = false;
  mock.Platform.isMobileApp = false;
  mock.Platform.isMacOS = true;
}

console.log("\n[1] final: no unexpected console errors during the whole run");
check("zero console.error calls", consoleErrors.length === 0, consoleErrors.slice(0, 3).join(" | "));

plugin.onunload();
check("onunload removes window.pinax", globalThis.window.pinax === undefined);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
