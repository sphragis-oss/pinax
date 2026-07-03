// Ported verbatim from the seed plugin ("The Helm") so output stays identical.

const FRONTMATTER_RE = /^---\n[\s\S]*?\n---\n+/;

export function stripFrontmatter(s: string): string {
  return s.replace(FRONTMATTER_RE, "");
}

export function parseFrontmatter(text: string): Record<string, string> {
  const m = text.match(/^---\n([\s\S]*?)\n---\n/);
  const fm: Record<string, string> = {};
  if (!m) return fm;
  for (const line of m[1].split("\n")) {
    const idx = line.indexOf(":");
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    const val = line.slice(idx + 1).trim();
    if (key) fm[key] = val;
  }
  return fm;
}

export interface TableRow {
  rank: string;
  repo: string;
  url: string | null;
  stars: string;
  starsNum: number;
  lang: string;
  desc: string;
}

export interface ScanSection {
  heading: string;
  kind: "cve" | "kep" | "release" | "table" | "other";
  bullets: string[];
  rows: TableRow[];
  emptyNote: string | null;
}

export function parseStars(s: string): number {
  const m = s.match(/([0-9.]+)\s*([kKmM]?)/);
  if (!m) return 0;
  const n = parseFloat(m[1]);
  const mult = m[2] === "k" || m[2] === "K" ? 1000 : m[2] === "m" || m[2] === "M" ? 1_000_000 : 1;
  return Math.round(n * mult);
}

export function parseTableRow(line: string): TableRow | null {
  const cells = line.split("|").map((c) => c.trim());
  if (cells.length < 5) return null;
  const inner = cells.slice(1, -1);
  if (inner.length < 5) return null;
  const linkMatch = inner[1].match(/\[([^\]]+)\]\(([^)]+)\)/);
  const starsStr = inner[2];
  return {
    rank: inner[0],
    repo: linkMatch?.[1] ?? inner[1],
    url: linkMatch?.[2] ?? null,
    stars: starsStr,
    starsNum: parseStars(starsStr),
    lang: inner[3] || "?",
    desc: inner[4] || "(no description)",
  };
}

export function parseScan(text: string): ScanSection[] {
  const stripped = stripFrontmatter(text);
  const blocks = stripped.split(/^##\s+/m).slice(1);
  const sections: ScanSection[] = [];
  for (const b of blocks) {
    const lines = b.split("\n");
    const heading = (lines.shift() || "").trim();
    const headLower = heading.toLowerCase();
    let kind: ScanSection["kind"] = "other";
    if (headLower.startsWith("security advisories") || headLower.startsWith("cve")) kind = "cve";
    else if (headLower.includes("kep")) kind = "kep";
    else if (headLower.startsWith("releases")) kind = "release";

    const bullets: string[] = [];
    const rows: TableRow[] = [];
    let emptyNote: string | null = null;
    let currentBullet: string | null = null;
    for (const raw of lines) {
      const line = raw.replace(/\s+$/, "");
      if (line.startsWith("|") && line.includes("|", 1)) {
        if (/^\|\s*-+\s*\|/.test(line)) continue;
        if (/^\|\s*#\s*\|/i.test(line)) continue;
        const row = parseTableRow(line);
        if (row) rows.push(row);
        continue;
      }
      if (line.startsWith("- ")) {
        if (currentBullet !== null) bullets.push(currentBullet);
        currentBullet = line.slice(2);
      } else if (currentBullet !== null && line.startsWith("  ")) {
        currentBullet += " " + line.trim();
      } else if (line.startsWith("_") && line.endsWith("_") && line.length > 2) {
        emptyNote = line.slice(1, -1);
      }
    }
    if (currentBullet !== null) bullets.push(currentBullet);
    if (rows.length > 0 && kind === "other") kind = "table";

    sections.push({ heading, kind, bullets, rows, emptyNote });
  }
  return sections;
}

export interface ParsedCve {
  id: string;
  ecosystem: string;
  title: string;
  url: string | null;
}

export function parseCveBullet(s: string): ParsedCve {
  const idMatch = s.match(/\*\*([A-Z]+-[A-Za-z0-9-]+)\*\*/);
  const ecoMatch = s.match(/\[([a-z0-9-]+)\](?!\()/i);
  const linkMatch = s.match(/\[[^\]]*\]\((https?:\/\/[^)]+)\)/);
  const title = s
    .replace(/\[[^\]]*\]\([^)]+\)/g, "")
    .replace(/\*\*[^*]+\*\*/g, "")
    .replace(/\[[a-z0-9-]+\](?!\()/gi, "")
    .replace(/\(\s*\)/g, "")
    .replace(/^\s*[-:]+\s*/, "")
    .trim();
  return {
    id: idMatch?.[1] ?? "advisory",
    ecosystem: ecoMatch?.[1] ?? "",
    title: title.length > 0 ? title : "(no description)",
    url: linkMatch?.[1] ?? null,
  };
}

export interface ParsedKep {
  ts: string;
  id: string;
  text: string;
}

export function parseKepBullet(s: string): ParsedKep {
  const m = s.match(/^(\S+?)\s+--?\s+(?:(KEP-\d+):\s+)?(.*)$/);
  if (m) {
    return { ts: m[1], id: m[2] || "", text: m[3] };
  }
  return { ts: "", id: "", text: s };
}

export interface ParsedRelease {
  repo: string;
  tag: string;
  url: string | null;
  name: string;
  date: string;
}

export function parseReleaseBullet(s: string): ParsedRelease {
  const repoMatch = s.match(/\*\*([^*]+)\*\*/);
  const linkMatch = s.match(/\[([^\]]+)\]\(([^)]+)\)/);
  const dateMatch = s.match(/\((\d{4}-\d{2}-\d{2})\)\s*$/);
  let rest = s
    .replace(/\*\*[^*]+\*\*/g, "")
    .replace(/\[[^\]]+\]\([^)]+\)/g, "")
    .replace(/\(\d{4}-\d{2}-\d{2}\)\s*$/, "")
    .replace(/^[\s\-:]+/, "")
    .replace(/\s+-+\s+/g, " ")
    .trim();
  if (!rest) rest = linkMatch?.[1] ?? "";
  return {
    repo: repoMatch?.[1] ?? "(unknown)",
    tag: linkMatch?.[1] ?? "",
    url: linkMatch?.[2] ?? null,
    name: rest,
    date: dateMatch?.[1] ?? "",
  };
}

export interface ReleaseHighlight { tag: string | null; text: string; }
export interface ReleaseSection { tag: string; date: string | null; url: string | null; tldr: string | null; highlights: ReleaseHighlight[]; }

export function parseReleaseScan(text: string): ReleaseSection[] {
  const stripped = stripFrontmatter(text);
  const blocks = stripped.split(/^##\s+/m).slice(1);
  const out: ReleaseSection[] = [];
  for (const b of blocks) {
    const lines = b.split("\n");
    const heading = (lines.shift() || "").trim();
    if (!heading || heading.toLowerCase().startsWith("# ")) continue;
    const headMatch = heading.match(/^(\S+)\s*-?\s*(.*)$/);
    const tag = headMatch ? headMatch[1] : heading;
    const date = headMatch && headMatch[2] ? headMatch[2].trim() : null;

    let tldr: string | null = null;
    let url: string | null = null;
    const highlights: ReleaseHighlight[] = [];
    let inHighlights = false;
    for (const raw of lines) {
      const line = raw.trimEnd();
      if (/^\*\*TL;DR:\*\*/.test(line)) {
        tldr = line.replace(/^\*\*TL;DR:\*\*\s*/, "").trim();
        continue;
      }
      if (/^\*\*Highlights:\*\*/.test(line)) { inHighlights = true; continue; }
      if (/^\*\*Full notes:\*\*/.test(line)) {
        inHighlights = false;
        const m = line.match(/\(([^)]+)\)/);
        if (m) url = m[1];
        continue;
      }
      if (inHighlights && line.startsWith("- ")) {
        const body = line.slice(2).trim();
        const m = body.match(/^\*\*\[([A-Z]+)\]\*\*\s*(.*)$/);
        if (m) highlights.push({ tag: m[1], text: m[2] });
        else highlights.push({ tag: null, text: body.replace(/^\*\*|\*\*$/g, "") });
      }
    }
    out.push({ tag, date, url, tldr, highlights });
  }
  return out;
}

export interface JiraTicket {
  key: string;
  url: string | null;
  summary: string;
  priority: string;
  updated: string;
}

export interface JiraGroup {
  heading: string;
  tickets: JiraTicket[];
}

export function parseJiraScan(text: string): JiraGroup[] {
  const stripped = stripFrontmatter(text);
  const blocks = stripped.split(/^##\s+/m).slice(1);
  const groups: JiraGroup[] = [];
  for (const b of blocks) {
    const lines = b.split("\n");
    const heading = (lines.shift() || "").trim();
    if (!heading) continue;
    if (/^action items/i.test(heading)) continue;
    const tickets: JiraTicket[] = [];
    for (const line of lines) {
      if (!line.startsWith("|")) continue;
      if (/^\|\s*-+\s*\|/.test(line)) continue;
      if (/^\|\s*Key\s*\|/i.test(line)) continue;
      const cells = line.split("|").map((c) => c.trim());
      const inner = cells.slice(1, -1);
      if (inner.length < 4) continue;
      const keyMatch = inner[0].match(/\[([^\]]+)\]\(([^)]+)\)/);
      tickets.push({
        key: keyMatch?.[1] ?? inner[0],
        url: keyMatch?.[2] ?? null,
        summary: inner[1] || "(no summary)",
        priority: inner[2] || "",
        updated: inner[3] || "",
      });
    }
    if (tickets.length > 0) groups.push({ heading, tickets });
  }
  return groups;
}

export interface McpEntry {
  name: string;
  type: string;
  endpoint: string;
  status: "connected" | "needs-auth" | "failed";
}

export function parseMcpAudit(text: string): McpEntry[] {
  const stripped = stripFrontmatter(text);
  const entries: McpEntry[] = [];
  const sections = stripped.split(/^##\s+/m).slice(1);
  for (const s of sections) {
    const lines = s.split("\n");
    const heading = (lines.shift() || "").toLowerCase();
    let status: McpEntry["status"];
    if (heading.startsWith("connected")) status = "connected";
    else if (heading.startsWith("needs auth")) status = "needs-auth";
    else if (heading.startsWith("failed")) status = "failed";
    else continue;
    for (const line of lines) {
      if (!line.startsWith("|")) continue;
      if (/^\|\s*-+\s*\|/.test(line)) continue;
      if (/^\|\s*Server\s*\|/i.test(line)) continue;
      const cells = line.split("|").map((c) => c.trim());
      const inner = cells.slice(1, -1);
      if (inner.length < 3) continue;
      const ep = inner[2].replace(/^`/, "").replace(/`$/, "");
      entries.push({ name: inner[0], type: inner[1], endpoint: ep, status });
    }
  }
  return entries;
}

export interface PlatformTable {
  headers: string[];
  rows: string[][];
}

export interface PlatformSection {
  tables: PlatformTable[];
  notes: string[];
}

export interface PlatformScan {
  terraform: PlatformSection;
  helm: PlatformSection;
  kubernetes: PlatformSection;
  actions: string[];
}

export function emptyPlatformSection(): PlatformSection {
  return { tables: [], notes: [] };
}

export interface SectionedScan {
  sections: Map<string, PlatformSection>;
  actions: string[];
}

export function parseSectionedScan(text: string): SectionedScan {
  const stripped = stripFrontmatter(text);
  const blocks = stripped.split(/^##\s+/m).slice(1);
  const out: SectionedScan = { sections: new Map(), actions: [] };
  for (const b of blocks) {
    const lines = b.split("\n");
    const headingFull = (lines.shift() || "").trim();
    const heading = headingFull.toLowerCase();

    if (heading.startsWith("action")) {
      for (const raw of lines) {
        const m = raw.match(/^-\s+(.+)$/);
        if (m) out.actions.push(m[1].trim());
      }
      continue;
    }

    const sec = emptyPlatformSection();
    out.sections.set(heading, sec);

    let current: PlatformTable | null = null;
    for (const raw of lines) {
      const line = raw.replace(/\s+$/, "");
      if (line.startsWith("|") && line.includes("|", 1)) {
        if (/^\|\s*-+\s*\|/.test(line)) continue;
        const cells = line.split("|").map((c) => c.trim()).slice(1, -1);
        if (cells.length === 0) continue;
        if (!current) {
          current = { headers: cells, rows: [] };
          sec.tables.push(current);
        } else {
          current.rows.push(cells);
        }
      } else {
        if (current && current.rows.length === 0 && line.trim() === "") continue;
        if (line.trim() === "") {
          current = null;
          continue;
        }
        if (line.startsWith("_") && line.endsWith("_") && line.length > 2) {
          sec.notes.push(line.slice(1, -1));
          current = null;
        }
      }
    }
  }
  return out;
}

export function parsePlatformScan(text: string): PlatformScan {
  const s = parseSectionedScan(text);
  const find = (prefix: string): PlatformSection => {
    for (const [k, v] of s.sections) if (k.startsWith(prefix)) return v;
    return emptyPlatformSection();
  };
  return {
    terraform: find("terraform"),
    helm: find("helm"),
    kubernetes: find("kubernetes").tables.length > 0 ? find("kubernetes") : find("k8s"),
    actions: s.actions,
  };
}

export function findSectionByPrefix(s: SectionedScan, prefix: string): PlatformSection | undefined {
  for (const [k, v] of s.sections) if (k.startsWith(prefix)) return v;
  return undefined;
}

export function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}
