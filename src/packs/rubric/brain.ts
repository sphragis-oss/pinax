import { Notice, TFile, TFolder } from "obsidian";
import type { WidgetContext, WidgetSpec } from "../../core/types";
import { placeholderEl } from "../../core/ui";

interface GraphNode { id: string; label?: string; community?: number; source_file?: string; }
interface GraphJson { nodes?: GraphNode[]; links?: unknown[]; }

interface Point { x: number; y: number; hue: number; dust: boolean; label: string; source: string; }

// deterministic 32-bit hash for stable per-node placement
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function unit(h: number): number { return ((h % 100000) + 0.5) / 100001; }

// gaussian pair from two hash-derived uniforms
function gauss(id: string): [number, number] {
  const u1 = unit(hash(id));
  const u2 = unit(hash(id + "g"));
  const r = Math.sqrt(-2 * Math.log(u1));
  return [r * Math.cos(2 * Math.PI * u2), r * Math.sin(2 * Math.PI * u2)];
}

const GOLDEN = Math.PI * (3 - Math.sqrt(5));
const HUES = [28, 168, 262, 200, 325, 45, 2, 150, 215, 90, 285, 20];
const DUST_MIN = 6;

// big communities cluster around a dense core; tiny ones become background dust
function layout(nodes: GraphNode[]): Point[] {
  const byCommunity = new Map<number, GraphNode[]>();
  for (const n of nodes) {
    const c = typeof n.community === "number" ? n.community : -1;
    const list = byCommunity.get(c) ?? [];
    list.push(n);
    byCommunity.set(c, list);
  }
  const groups = [...byCommunity.values()].sort((a, b) => b.length - a.length);
  const clusters = groups.filter((g) => g.length >= DUST_MIN);
  const dust = groups.filter((g) => g.length < DUST_MIN).flat();
  const biggest = clusters[0]?.length ?? 1;
  const points: Point[] = [];

  clusters.forEach((members, gi) => {
    const spread = gi === 0 ? 0 : 0.72 * Math.sqrt((gi + 0.3) / clusters.length);
    const cx = spread * Math.cos(gi * GOLDEN);
    const cy = spread * Math.sin(gi * GOLDEN);
    const clusterR = 0.07 + 0.19 * Math.sqrt(members.length / biggest);
    const hue = HUES[gi % HUES.length];
    for (const n of members) {
      const [gx, gy] = gauss(n.id);
      let x = cx + gx * clusterR * 0.45;
      let y = cy + gy * clusterR * 0.45;
      const d = Math.sqrt(x * x + y * y);
      if (d > 0.98) { x *= 0.98 / d; y *= 0.98 / d; }
      points.push({ x, y, hue, dust: false, label: n.label ?? n.id, source: n.source_file ?? "" });
    }
  });
  for (const n of dust) {
    const a = unit(hash(n.id)) * Math.PI * 2;
    const r = Math.sqrt(unit(hash(n.id + "d")));
    points.push({
      x: r * Math.cos(a), y: r * Math.sin(a),
      hue: 35, dust: true, label: n.label ?? n.id, source: n.source_file ?? "",
    });
  }
  return points;
}

interface RingItem { title: string; icon: string; path: string; url: string; }

function ringItems(ctx: WidgetContext, folder: string, max: number): RingItem[] {
  const f = ctx.app.vault.getAbstractFileByPath(folder);
  if (!(f instanceof TFolder)) return [];
  const notes = f.children
    .filter((c): c is TFile => c instanceof TFile && c.extension === "md" && c.name !== "_index.md")
    .sort((a, b) => b.stat.mtime - a.stat.mtime)
    .slice(0, max);
  return notes.map((n) => {
    const fm = ctx.app.metadataCache.getFileCache(n)?.frontmatter ?? {};
    return {
      title: typeof fm.title === "string" ? fm.title : n.basename,
      icon: typeof fm.icon === "string" ? fm.icon : "◇",
      path: n.path,
      url: typeof fm.url === "string" ? fm.url : "",
    };
  });
}

// few orbs sit on the bottom arc; a full deck wraps the whole ring
function orbAngle(i: number, n: number): number {
  if (n >= 10) return -Math.PI / 2 + (i / n) * Math.PI * 2;
  const span = Math.min(2.1, 0.55 * n);
  const start = Math.PI / 2 - span / 2;
  return n === 1 ? Math.PI / 2 : start + (i / (n - 1)) * span;
}

export const brainWidget: WidgetSpec = {
  async render(el, ctx): Promise<void | (() => void)> {
    const pane = ctx.pane;
    const path = typeof pane.folder === "string" ? pane.folder : "graphify-out/graph.json";
    const openPath = typeof pane.note === "string" ? pane.note : "graphify-out/graph.html";
    const ringFolder = typeof pane.ringFolder === "string" ? pane.ringFolder : "";
    const heading = typeof pane.heading === "string" ? pane.heading : "";
    const subtitle = typeof pane.subtitle === "string" ? pane.subtitle : "";

    let graph: GraphJson;
    try {
      graph = JSON.parse(await ctx.app.vault.adapter.read(path)) as GraphJson;
    } catch {
      placeholderEl(el, "no knowledge graph yet", `Could not read ${path}. Run /graphify to build it.`);
      return;
    }
    const nodes = graph.nodes ?? [];
    if (nodes.length === 0) {
      placeholderEl(el, "empty graph", `${path} has no nodes. Run /graphify to rebuild it.`);
      return;
    }
    const points = layout(nodes);
    const communities = new Set(nodes.map((n) => n.community ?? -1)).size;

    const wrap = el.createDiv({ cls: "px-brain" });
    const fixedH = Number(pane.height) || 0;
    if (fixedH >= 280) wrap.style.height = `${fixedH}px`;
    else wrap.addClass("px-brain-fill");
    if (heading !== "") {
      const head = wrap.createDiv({ cls: "px-brain__head" });
      head.createDiv({ text: heading, cls: "px-brain__title" });
      if (subtitle !== "") head.createDiv({ text: subtitle, cls: "px-brain__subtitle" });
    }
    const canvas = wrap.createEl("canvas", { cls: "px-brain__canvas" });
    const tip = wrap.createDiv({ cls: "px-brain__tip" });
    tip.hide();
    const foot = wrap.createDiv({ cls: "px-brain__foot" });
    foot.createSpan({ text: `${nodes.length} nodes · ${(graph.links ?? []).length} links · ${communities} communities`, cls: "px-brain__stats" });
    foot.createSpan({ text: "node → open note · space → full graph", cls: "px-brain__hint" });

    interface Orb { elBtn: HTMLElement; angle: number; }
    const orbs: Orb[] = [];
    if (ringFolder !== "") {
      const items = ringItems(ctx, ringFolder, 20);
      const ring = wrap.createDiv({ cls: "px-brain__ring" });
      items.forEach((it, i) => {
        const btn = ring.createEl("button", { cls: "px-brain__orb", text: it.icon });
        btn.title = it.title;
        btn.setAttribute("aria-label", it.title);
        btn.onclick = (ev) => {
          ev.stopPropagation();
          if (it.url !== "") {
            if (!ctx.trust.web) { new Notice("Pinax: enable Web embeds for this profile to open artifact links."); return; }
            window.open(it.url);
            return;
          }
          ctx.openNote(it.path);
        };
        orbs.push({ elBtn: btn, angle: orbAngle(i, items.length) });
      });
    }

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let angle = 0;
    let raf = 0;
    let hover: Point | null = null;

    const geometry = (): { w: number; h: number; cx: number; cy: number; R: number } => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      return { w, h, cx: w / 2, cy: h * 0.52, R: Math.min(w, h) * 0.36 };
    };

    const accent = (): string => getComputedStyle(wrap).getPropertyValue("--accent").trim() || "#ff7a2f";

    const draw = (): void => {
      const dpr = window.devicePixelRatio || 1;
      const { w, h, cx, cy, R } = geometry();
      if (w === 0 || h === 0) return;
      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
      }
      const g = canvas.getContext("2d");
      if (!g) return;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, w, h);

      const Rr = R * 1.15;
      g.strokeStyle = accent();
      g.globalAlpha = 0.14;
      g.lineWidth = 1;
      g.beginPath();
      g.ellipse(cx, cy, Rr, Rr, 0, 0, Math.PI * 2);
      g.stroke();
      g.globalAlpha = 1;

      const cos = Math.cos(angle), sin = Math.sin(angle);
      for (const p of points) {
        const x = cx + (p.x * cos - p.y * sin) * R;
        const y = cy + (p.x * sin + p.y * cos) * R;
        if (p.dust) {
          g.fillStyle = "hsla(35, 25%, 72%, 0.28)";
          g.fillRect(x, y, 1.2, 1.2);
          continue;
        }
        g.fillStyle = `hsla(${p.hue}, 70%, 60%, 0.15)`;
        g.beginPath();
        g.arc(x, y, 4.2, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = `hsla(${p.hue}, 72%, ${p === hover ? 86 : 64}%, 0.95)`;
        g.beginPath();
        g.arc(x, y, p === hover ? 3.2 : 1.7, 0, Math.PI * 2);
        g.fill();
      }

      for (const o of orbs) {
        o.elBtn.style.left = `${cx + Rr * Math.cos(o.angle)}px`;
        o.elBtn.style.top = `${cy + Rr * Math.sin(o.angle)}px`;
      }
    };

    const loop = (t: number): void => {
      angle = (t / 1000) * 0.012;
      draw();
      raf = window.requestAnimationFrame(loop);
    };
    if (reduceMotion) draw();
    else raf = window.requestAnimationFrame(loop);

    const ro = new ResizeObserver(() => { if (reduceMotion) draw(); });
    ro.observe(canvas);

    const hit = (ev: MouseEvent): Point | null => {
      const rect = canvas.getBoundingClientRect();
      const { cx, cy, R } = geometry();
      const mx = ev.clientX - rect.left, my = ev.clientY - rect.top;
      const cos = Math.cos(angle), sin = Math.sin(angle);
      let best: Point | null = null;
      let bestD = 90;
      for (const p of points) {
        if (p.dust) continue;
        const x = cx + (p.x * cos - p.y * sin) * R;
        const y = cy + (p.x * sin + p.y * cos) * R;
        const d = (x - mx) * (x - mx) + (y - my) * (y - my);
        if (d < bestD) { bestD = d; best = p; }
      }
      return best;
    };

    canvas.addEventListener("mousemove", (ev) => {
      hover = hit(ev);
      if (hover) {
        const rect = canvas.getBoundingClientRect();
        tip.setText(hover.label);
        tip.style.left = `${ev.clientX - rect.left + 12}px`;
        tip.style.top = `${ev.clientY - rect.top - 8}px`;
        tip.show();
        canvas.style.cursor = "pointer";
      } else {
        tip.hide();
        canvas.style.cursor = "default";
      }
      if (reduceMotion) draw();
    });
    canvas.addEventListener("mouseleave", () => { hover = null; tip.hide(); if (reduceMotion) draw(); });
    canvas.addEventListener("click", (ev) => {
      const p = hit(ev);
      if (p && p.source.endsWith(".md")) { ctx.openNote(p.source); return; }
      const opener = (ctx.app as unknown as { openWithDefaultApp?: (p: string) => void }).openWithDefaultApp;
      if (opener) opener.call(ctx.app, openPath);
      else new Notice(`Pinax: open ${openPath} manually.`);
    });

    return () => { window.cancelAnimationFrame(raf); ro.disconnect(); };
  },
};
