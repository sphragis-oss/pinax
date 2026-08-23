import { Notice, TFile, TFolder } from "obsidian";
import type { WidgetContext, WidgetSpec } from "../../core/types";
import { placeholderEl } from "../../core/ui";

interface GraphNode { id: string; label?: string; community?: number; source_file?: string; }
interface GraphLink { source?: unknown; target?: unknown; }
interface GraphJson { nodes?: GraphNode[]; links?: GraphLink[]; }

interface Point {
  id: string;
  x: number; y: number; z: number;
  hue: number; light: number; size: number; tw: number;
  dust: boolean; label: string; source: string;
  sx: number; sy: number; depth: number;
}

// deterministic 32-bit hash for stable per-node placement
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function unit(h: number): number { return ((h % 100000) + 0.5) / 100001; }

function gaussPair(id: string): [number, number] {
  const u1 = unit(hash(id));
  const u2 = unit(hash(id + "g"));
  const r = Math.sqrt(-2 * Math.log(u1));
  return [r * Math.cos(2 * Math.PI * u2), r * Math.sin(2 * Math.PI * u2)];
}

const GOLDEN = Math.PI * (3 - Math.sqrt(5));
// warm-biased hues that sit well on the rubric orange chrome
const HUES = [25, 175, 350, 210, 45, 320, 150, 260, 15, 190, 300, 35];
const DUST_MIN = 6;

// 3D nebula: cluster centers on a fibonacci ball, nodes gaussian around them, tiny communities become dust
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
    const fy = 1 - 2 * ((gi + 0.5) / clusters.length);
    const fr = Math.sqrt(Math.max(0, 1 - fy * fy));
    const fa = gi * GOLDEN;
    const dist = gi === 0 ? 0 : 0.35 + 0.55 * Math.sqrt(gi / clusters.length);
    const cx = fr * Math.cos(fa) * dist;
    const cy = fy * dist;
    const cz = fr * Math.sin(fa) * dist;
    const sigma = 0.09 + 0.20 * Math.sqrt(members.length / biggest);
    const hue = HUES[gi % HUES.length];
    for (const n of members) {
      const [g1, g2] = gaussPair(n.id);
      const [g3] = gaussPair(n.id + "z");
      let x = cx + g1 * sigma, y = cy + g2 * sigma, z = cz + g3 * sigma;
      const d = Math.sqrt(x * x + y * y + z * z);
      if (d > 0.98) { const s = 0.98 / d; x *= s; y *= s; z *= s; }
      const h = hash(n.id + "v");
      points.push({
        id: n.id,
        x, y, z, hue: hue + (h % 17) - 8,
        light: 52 + (h % 19), size: 1.1 + 1.5 * unit(hash(n.id + "s")),
        tw: unit(hash(n.id + "t")) < 0.07 ? (h % 628) / 100 : -1,
        dust: false, label: n.label ?? n.id, source: n.source_file ?? "",
        sx: 0, sy: 0, depth: 0,
      });
    }
  });
  for (const n of dust) {
    const [g1, g2] = gaussPair(n.id);
    const [g3] = gaussPair(n.id + "z");
    const len = Math.sqrt(g1 * g1 + g2 * g2 + g3 * g3) || 1;
    const r = Math.cbrt(unit(hash(n.id + "d")));
    points.push({
      id: n.id,
      x: (g1 / len) * r, y: (g2 / len) * r, z: (g3 / len) * r,
      hue: 35, light: 60, size: 1, tw: -1,
      dust: true, label: n.label ?? n.id, source: n.source_file ?? "",
      sx: 0, sy: 0, depth: 0,
    });
  }
  return points;
}

function accentRgb(el: HTMLElement): [number, number, number] {
  const v = getComputedStyle(el).getPropertyValue("--accent").trim();
  const m = v.match(/^#([0-9a-f]{6})$/i);
  if (!m) return [255, 122, 47];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
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

// few orbs sit on the bottom-left arc clear of the footer; a full deck wraps the whole ring
function orbAngle(i: number, n: number): number {
  if (n >= 10) return -Math.PI / 2 + (i / n) * Math.PI * 2;
  const center = Math.PI * 0.72;
  const span = Math.min(1.9, 0.5 * n);
  return n === 1 ? center : center - span / 2 + (i / (n - 1)) * span;
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
    const order = points.map((_, i) => i);
    const communities = new Set(nodes.map((n) => n.community ?? -1)).size;

    // short intra-cloud links only, shortest first, capped for legibility
    const idIndex = new Map(points.map((p, i) => [p.id, i]));
    const edges: [number, number, number][] = [];
    for (const l of graph.links ?? []) {
      const a = idIndex.get(String(l.source));
      const b = idIndex.get(String(l.target));
      if (a === undefined || b === undefined) continue;
      const pa = points[a], pb = points[b];
      if (pa.dust || pb.dust) continue;
      const dx = pa.x - pb.x, dy = pa.y - pb.y, dz = pa.z - pb.z;
      const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (len < 0.34) edges.push([a, b, len]);
    }
    edges.sort((a, b) => a[2] - b[2]);
    edges.length = Math.min(edges.length, 1500);

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
    foot.createSpan({ text: "node → open note · space → full graph · ⌘scroll → zoom", cls: "px-brain__hint" });

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
    let now = 0;
    let zoom = 1;
    let raf = 0;
    let hover: Point | null = null;

    const geometry = (): { w: number; h: number; cx: number; cy: number; R: number } => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      return { w, h, cx: w / 2, cy: h * 0.53, R: Math.min(w, h) * 0.37 * zoom };
    };

    // rotate around Y, project, sort back-to-front, shade by depth
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

      const [ar, ag, ab] = accentRgb(wrap);
      const glow = g.createRadialGradient(cx, cy, 0, cx, cy, R * 1.05);
      glow.addColorStop(0, `rgba(${ar}, ${ag}, ${ab}, 0.07)`);
      glow.addColorStop(1, "rgba(0, 0, 0, 0)");
      g.fillStyle = glow;
      g.fillRect(cx - R * 1.1, cy - R * 1.1, R * 2.2, R * 2.2);

      const Rr = R * 1.22;
      g.strokeStyle = `rgb(${ar}, ${ag}, ${ab})`;
      g.globalAlpha = 0.14;
      g.lineWidth = 1;
      g.beginPath();
      g.ellipse(cx, cy, Rr, Rr, 0, 0, Math.PI * 2);
      g.stroke();
      g.globalAlpha = 1;

      const cos = Math.cos(angle), sin = Math.sin(angle);
      for (const p of points) {
        const rx = p.x * cos + p.z * sin;
        const rz = -p.x * sin + p.z * cos;
        p.sx = cx + rx * R;
        p.sy = cy + p.y * R * 0.94;
        p.depth = (rz + 1) / 2;
      }
      order.sort((a, b) => points[a].depth - points[b].depth);

      g.lineWidth = 0.6;
      for (const [a, b] of edges) {
        const pa = points[a], pb = points[b];
        const d = (pa.depth + pb.depth) / 2;
        g.strokeStyle = `hsla(${pa.hue}, 55%, 62%, ${0.03 + 0.09 * d})`;
        g.beginPath();
        g.moveTo(pa.sx, pa.sy);
        g.lineTo(pb.sx, pb.sy);
        g.stroke();
      }

      for (const i of order) {
        const p = points[i];
        const d = p.depth;
        if (p.dust) {
          g.fillStyle = `hsla(35, 22%, 70%, ${0.10 + 0.16 * d})`;
          g.fillRect(p.sx, p.sy, 1.1, 1.1);
          continue;
        }
        const size = p.size * (0.55 + 0.65 * d);
        let alpha = 0.30 + 0.62 * d;
        if (p.tw >= 0 && !reduceMotion) alpha *= 0.70 + 0.30 * Math.sin(now * 2.2 + p.tw);
        if (d > 0.6) {
          g.fillStyle = `hsla(${p.hue}, 68%, ${p.light}%, ${0.10 + 0.08 * d})`;
          g.beginPath();
          g.arc(p.sx, p.sy, size * 2.7, 0, Math.PI * 2);
          g.fill();
        }
        const lit = p === hover ? 88 : p.light + 14 * d;
        g.fillStyle = `hsla(${p.hue}, 70%, ${lit}%, ${p === hover ? 1 : alpha})`;
        g.beginPath();
        g.arc(p.sx, p.sy, p === hover ? size + 1.6 : size, 0, Math.PI * 2);
        g.fill();
      }

      for (const o of orbs) {
        o.elBtn.style.left = `${cx + Rr * Math.cos(o.angle)}px`;
        o.elBtn.style.top = `${cy + Rr * Math.sin(o.angle)}px`;
      }
    };

    const loop = (t: number): void => {
      now = t / 1000;
      angle = now * 0.012;
      draw();
      raf = window.requestAnimationFrame(loop);
    };
    if (reduceMotion) draw();
    else raf = window.requestAnimationFrame(loop);

    const ro = new ResizeObserver(() => { if (reduceMotion) draw(); });
    ro.observe(canvas);

    // pick the nearest front-half projected point
    const hit = (ev: MouseEvent): Point | null => {
      const rect = canvas.getBoundingClientRect();
      const mx = ev.clientX - rect.left, my = ev.clientY - rect.top;
      let best: Point | null = null;
      let bestD = 90;
      for (const p of points) {
        if (p.dust || p.depth < 0.35) continue;
        const d = (p.sx - mx) * (p.sx - mx) + (p.sy - my) * (p.sy - my);
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
        canvas.addClass("px-brain__canvas--hover");
      } else {
        tip.hide();
        canvas.removeClass("px-brain__canvas--hover");
      }
      if (reduceMotion) draw();
    });
    canvas.addEventListener("mouseleave", () => { hover = null; tip.hide(); if (reduceMotion) draw(); });
    // pinch or ctrl/cmd+scroll zooms; plain scroll keeps scrolling the page
    canvas.addEventListener("wheel", (ev) => {
      if (!ev.ctrlKey && !ev.metaKey) return;
      ev.preventDefault();
      zoom = Math.min(3, Math.max(0.6, zoom * Math.exp(-ev.deltaY * 0.002)));
      if (reduceMotion) draw();
    }, { passive: false });
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
