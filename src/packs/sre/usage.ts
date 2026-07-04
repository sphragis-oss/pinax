import { Platform } from "obsidian";
import type { WidgetContext, WidgetSpec } from "../../core/types";
import { nodeRequire, NodeDirent, NodeFs, NodeOs, NodePath, NodeStats } from "../../core/platform";
import { metricTile } from "./helpers";

export function prettyModel(id: string): string {
  const m = id.toLowerCase();
  const fam = m.includes("opus") ? "Opus"
    : m.includes("sonnet") ? "Sonnet"
    : m.includes("haiku") ? "Haiku"
    : m.includes("fable") ? "Fable"
    : null;
  const ver = m.match(/(\d+)[-.](\d+)/);
  if (fam) return ver ? `${fam} ${ver[1]}.${ver[2]}` : fam;
  return id.replace(/^claude-/, "").split("-").slice(0, 3).join("-");
}

interface UsageBucket {
  input: number;
  cacheCreate: number;
  cacheRead: number;
  output: number;
  webSearch: number;
  total: number;
  sessions: number;
  cacheHitPct: number;
  estCostUsd: number;
}

interface SessionStat { date: string; project: string; total: number; output: number; }

interface ModelStat {
  model: string;
  input: number;
  cacheCreate: number;
  cacheRead: number;
  output: number;
  total: number;
  estCostUsd: number;
}

export interface WindowAgg {
  bucket: UsageBucket;
  perDay: { date: string; cost: number; total: number; output: number }[];
  byModel: ModelStat[];
  toolCounts: { name: string; count: number }[];
  topSessions: SessionStat[];
  totalSessions: number;
}

function emptyBucket(): UsageBucket {
  return { input: 0, cacheCreate: 0, cacheRead: 0, output: 0, webSearch: 0, total: 0, sessions: 0, cacheHitPct: 0, estCostUsd: 0 };
}

interface ModelPrice { input: number; cacheCreate: number; cacheRead: number; output: number; }

const MILLION = 1_000_000;

function pricePerM(model: string): ModelPrice | null {
  const m = model.toLowerCase();
  if (m.includes("opus")) return { input: 15, cacheCreate: 18.75, cacheRead: 1.50, output: 75 };
  if (m.includes("sonnet")) return { input: 3, cacheCreate: 3.75, cacheRead: 0.30, output: 15 };
  if (m.includes("haiku")) return { input: 1, cacheCreate: 1.25, cacheRead: 0.10, output: 5 };
  return null;
}

function estCost(model: string, b: { input: number; cacheCreate: number; cacheRead: number; output: number }): number {
  const p = pricePerM(model);
  if (!p) return 0;
  return (b.input * p.input + b.cacheCreate * p.cacheCreate + b.cacheRead * p.cacheRead + b.output * p.output) / MILLION;
}

export function fmtTokens(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1) + "k";
  return String(n);
}

// Reads local Claude Code session logs (~/.claude/projects); desktop only
export async function aggregateWindow(days: number): Promise<WindowAgg | null> {
  if (!Platform.isDesktopApp) return null;
  const fs = nodeRequire<NodeFs>("fs");
  const path = nodeRequire<NodePath>("path");
  const os = nodeRequire<NodeOs>("os");
  if (!fs || !path || !os) return null;

  const projectsDir = path.join(os.homedir(), ".claude", "projects");
  if (!fs.existsSync(projectsDir)) return null;

  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  const cutoff = now - days * dayMs;

  const bucket = emptyBucket();
  const perModel = new Map<string, ModelStat>();
  const toolCounts = new Map<string, number>();
  const perSession = new Map<string, SessionStat>();
  const dayMap = new Map<string, { cost: number; total: number; output: number }>();
  let totalSessions = 0;

  for (const pd of fs.readdirSync(projectsDir, { withFileTypes: true })) {
    if (!pd.isDirectory()) continue;
    const projPath = path.join(projectsDir, pd.name);
    let files: NodeDirent[];
    try { files = fs.readdirSync(projPath, { withFileTypes: true }); } catch { continue; }
    for (const f of files) {
      if (!f.isFile() || !f.name.endsWith(".jsonl")) continue;
      const filePath = path.join(projPath, f.name);
      let stat: NodeStats;
      try { stat = fs.statSync(filePath); } catch { continue; }
      if (stat.mtimeMs < cutoff) continue;
      let content: string;
      try { content = fs.readFileSync(filePath, "utf8"); } catch { continue; }

      let sIn = 0, sCc = 0, sCr = 0, sOut = 0, sWeb = 0, sCost = 0;
      for (const line of content.split("\n")) {
        if (!line.trim()) continue;
        type UsageRec = { message?: { model?: string; usage?: Record<string, unknown>; content?: unknown[] } };
        let rec: UsageRec;
        try { rec = JSON.parse(line) as UsageRec; } catch { continue; }
        const msg = rec.message;
        if (!msg) continue;
        if (Array.isArray(msg.content)) {
          for (const c of msg.content) {
            if (c && typeof c === "object" && (c as Record<string, unknown>).type === "tool_use") {
              const name = (c as Record<string, unknown>).name;
              if (typeof name === "string") toolCounts.set(name, (toolCounts.get(name) ?? 0) + 1);
            }
          }
        }
        if (!msg.usage) continue;
        const u = msg.usage;
        const model = msg.model ?? "unknown";
        const intok = Number(u.input_tokens ?? 0);
        const ccrea = Number(u.cache_creation_input_tokens ?? 0);
        const cread = Number(u.cache_read_input_tokens ?? 0);
        const outtok = Number(u.output_tokens ?? 0);
        const stool = u.server_tool_use as Record<string, unknown> | undefined;
        sIn += intok; sCc += ccrea; sCr += cread; sOut += outtok;
        sWeb += Number(stool?.web_search_requests ?? 0);
        const turnCost = estCost(model, { input: intok, cacheCreate: ccrea, cacheRead: cread, output: outtok });
        sCost += turnCost;
        const ms = perModel.get(model) ?? { model, input: 0, cacheCreate: 0, cacheRead: 0, output: 0, total: 0, estCostUsd: 0 };
        ms.input += intok; ms.cacheCreate += ccrea; ms.cacheRead += cread; ms.output += outtok;
        ms.total += intok + ccrea + cread + outtok; ms.estCostUsd += turnCost;
        perModel.set(model, ms);
      }

      const sTotal = sIn + sCc + sCr + sOut;
      if (sTotal === 0) continue;
      totalSessions++;
      bucket.input += sIn; bucket.cacheCreate += sCc; bucket.cacheRead += sCr; bucket.output += sOut;
      bucket.webSearch += sWeb; bucket.total += sTotal; bucket.estCostUsd += sCost; bucket.sessions++;

      const dateStr = new Date(stat.mtimeMs).toISOString().slice(0, 10);
      const dm = dayMap.get(dateStr) ?? { cost: 0, total: 0, output: 0 };
      dm.cost += sCost; dm.total += sTotal; dm.output += sOut;
      dayMap.set(dateStr, dm);
      const projLabel = pd.name.replace(/^-Users-[^-]+-/, "").replace(/-/g, "/").slice(0, 50);
      perSession.set(projPath + "/" + f.name, { date: dateStr, project: projLabel, total: sTotal, output: sOut });
    }
  }

  const cacheable = bucket.input + bucket.cacheCreate + bucket.cacheRead;
  bucket.cacheHitPct = cacheable > 0 ? Math.round((bucket.cacheRead / cacheable) * 100) : 0;

  const perDay: { date: string; cost: number; total: number; output: number }[] = [];
  const today = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const iso = d.toISOString().slice(0, 10);
    const dm = dayMap.get(iso) ?? { cost: 0, total: 0, output: 0 };
    perDay.push({ date: iso, cost: dm.cost, total: dm.total, output: dm.output });
  }
  const byModel = Array.from(perModel.values()).sort((a, b) => b.total - a.total);
  const toolList = Array.from(toolCounts.entries())
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 12);
  const topSessions = Array.from(perSession.values()).sort((a, b) => b.output - a.output).slice(0, 12);
  return { bucket, perDay, byModel, toolCounts: toolList, topSessions, totalSessions };
}


function renderLineChart(parent: HTMLElement, points: { label: string; value: number }[]): void {
  const W = 100, H = 34, PADX = 1, PADY = 3;
  const rootEl = parent.closest(".cc-root");
  const cs = rootEl ? getComputedStyle(rootEl) : null;
  const stroke = cs?.getPropertyValue("--accent").trim() || "#ffc799";
  const vals = points.map((p) => p.value);
  const max = Math.max(...vals, 0.0001);
  const min = Math.min(...vals, 0);
  const range = max - min || 1;
  const n = points.length;
  const step = n > 1 ? (W - PADX * 2) / (n - 1) : 0;
  const xy = points.map((p, i) => {
    const x = PADX + i * step;
    const y = H - PADY - ((p.value - min) / range) * (H - PADY * 2);
    return [x, y] as [number, number];
  });
  const poly = xy.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(" ");
  const svg = createSvg("svg");
  svg.setAttribute("class", "cc-linechart");
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.setAttribute("preserveAspectRatio", "none");
  const area = createSvg("polygon");
  area.setAttribute("points", `${PADX},${H} ${poly} ${(W - PADX).toFixed(2)},${H}`);
  area.setAttribute("fill", stroke + "22");
  area.setAttribute("stroke", "none");
  svg.appendChild(area);
  const line = createSvg("polyline");
  line.setAttribute("points", poly);
  line.setAttribute("fill", "none");
  line.setAttribute("stroke", stroke);
  line.setAttribute("stroke-width", "1");
  line.setAttribute("stroke-linejoin", "round");
  line.setAttribute("vector-effect", "non-scaling-stroke");
  svg.appendChild(line);
  const [lx, ly] = xy[xy.length - 1];
  const dot = createSvg("circle");
  dot.setAttribute("cx", lx.toFixed(2));
  dot.setAttribute("cy", ly.toFixed(2));
  dot.setAttribute("r", "1.4");
  dot.setAttribute("fill", stroke);
  svg.appendChild(dot);
  parent.appendChild(svg);
}

export const usageWidget: WidgetSpec = {
  render(el: HTMLElement, ctx: WidgetContext): void {
    let usageDays = 7;
    let usageSort: "total" | "cost" | "output" = "total";

    const pane = el.createDiv({ cls: "cc-pane cc-pane-wide" });
    pane.createEl("h3", { text: String(ctx.pane.title ?? "▤ USAGE · tokens / cost (est)") });

    const seg = pane.createDiv({ cls: "cc-seg" });
    const segBtns = new Map<number, HTMLElement>();
    for (const r of [{ label: "Today", days: 1 }, { label: "7d", days: 7 }, { label: "30d", days: 30 }]) {
      const b = seg.createEl("button", { cls: "cc-seg-btn" + (usageDays === r.days ? " cc-seg-on" : ""), text: r.label });
      segBtns.set(r.days, b);
      b.onclick = () => {
        usageDays = r.days;
        segBtns.forEach((el2, d) => el2.toggleClass("cc-seg-on", d === usageDays));
        void redraw();
      };
    }

    const container = pane.createDiv();

    const redraw = async (): Promise<void> => {
      container.empty();
      container.createEl("div", { text: "aggregating…", cls: "cc-muted" });
      if (!Platform.isDesktopApp) {
        container.empty();
        container.createEl("div", { text: "Usage reads local session logs; desktop only.", cls: "cc-empty" });
        return;
      }
      let agg: WindowAgg | null;
      try { agg = await aggregateWindow(usageDays); }
      catch (err) { container.empty(); container.createEl("div", { text: `Read error: ${String(err)}`, cls: "cc-empty" }); return; }
      container.empty();
      if (!agg || agg.bucket.sessions === 0) {
        container.createEl("div", { text: `No local sessions in last ${usageDays}d.`, cls: "cc-empty" });
        return;
      }

      const tiles = container.createDiv({ cls: "cc-metric-row" });
      metricTile(tiles, "EST COST", "$" + agg.bucket.estCostUsd.toFixed(2), `${agg.bucket.sessions} sessions`);
      metricTile(tiles, "TOTAL TOKENS", fmtTokens(agg.bucket.total), `${agg.bucket.cacheHitPct}% cache hit`);
      metricTile(tiles, "OUTPUT", fmtTokens(agg.bucket.output), "most expensive");
      metricTile(tiles, "WEB SEARCH", String(agg.bucket.webSearch), "server tool");

      const chart = container.createDiv({ cls: "cc-chart-card" });
      const chartHead = chart.createDiv({ cls: "cc-chart-head" });
      chartHead.createSpan({ text: `cost / day (last ${usageDays}d)`, cls: "cc-muted" });
      const peak = Math.max(...agg.perDay.map((d) => d.cost), 0);
      chartHead.createSpan({ text: `peak $${peak.toFixed(2)}`, cls: "cc-muted" });
      renderLineChart(chart, agg.perDay.map((d) => ({ label: d.date, value: d.cost })));

      container.createDiv({ text: "by model", cls: "cc-subhead" });
      const sortRow = container.createDiv({ cls: "cc-chip-row" });
      for (const k of ["total", "cost", "output"] as const) {
        const sb = sortRow.createEl("button", { cls: "cc-chip" + (usageSort === k ? " cc-chip-on" : ""), text: `sort: ${k}` });
        sb.onclick = () => { usageSort = k; void redraw(); };
      }
      const models = [...agg.byModel].sort((a, b) =>
        usageSort === "cost" ? b.estCostUsd - a.estCostUsd
          : usageSort === "output" ? b.output - a.output
          : b.total - a.total);
      const mlist = container.createEl("ul", { cls: "cc-model-list" });
      for (const m of models) {
        const li = mlist.createEl("li", { cls: "cc-model-row" });
        li.createSpan({ text: prettyModel(m.model), cls: "cc-model-name" });
        li.createSpan({ text: fmtTokens(m.total), cls: "cc-model-total" });
        li.createSpan({ text: "$" + m.estCostUsd.toFixed(2), cls: "cc-model-cost" });
        li.createSpan({ text: `in ${fmtTokens(m.input)} · cr ${fmtTokens(m.cacheRead)} · out ${fmtTokens(m.output)}`, cls: "cc-muted cc-model-breakdown" });
      }

      if (agg.toolCounts.length > 0) {
        container.createDiv({ text: "top tools", cls: "cc-subhead" });
        const tl = container.createEl("ul", { cls: "cc-tool-list" });
        const max = agg.toolCounts[0].count;
        for (const t of agg.toolCounts) {
          const li = tl.createEl("li", { cls: "cc-tool-row" });
          li.createSpan({ text: t.name, cls: "cc-tool-name" });
          const bw = li.createDiv({ cls: "cc-tool-bar-wrap" });
          bw.createDiv({ cls: "cc-tool-bar" }).style.width = `${(t.count / max) * 100}%`;
          li.createSpan({ text: String(t.count), cls: "cc-tool-count" });
        }
      }

      if (agg.topSessions.length > 0) {
        container.createDiv({ text: "top sessions by output", cls: "cc-subhead" });
        const sl = container.createEl("ul", { cls: "cc-usage-list" });
        for (const s of agg.topSessions) {
          const li = sl.createEl("li", { cls: "cc-usage-row" });
          li.createSpan({ text: s.date, cls: "cc-usage-date" });
          li.createSpan({ text: s.project, cls: "cc-usage-project" });
          li.createSpan({ text: fmtTokens(s.total), cls: "cc-usage-total" });
          li.createSpan({ text: `out ${fmtTokens(s.output)}`, cls: "cc-muted" });
        }
      }
      container.createDiv({ text: "API-equivalent estimate (Opus/Sonnet/Haiku public rates); your plan bills a flat rate.", cls: "cc-muted cc-usage-breakdown" });
    };
    void redraw();
  },
};
