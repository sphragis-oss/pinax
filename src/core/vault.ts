import { App, TFile, TFolder, normalizePath } from "obsidian";
import type { FolderEntry, NoteRecord } from "./types";
import { safeVaultPath } from "./trust";

export function getFolder(app: App, folder: string): TFolder | null {
  const p = safeVaultPath(folder);
  const f = app.vault.getAbstractFileByPath(normalizePath(p));
  return f instanceof TFolder ? f : null;
}

function mdFiles(folder: TFolder): TFile[] {
  return folder.children.filter(
    (c): c is TFile => c instanceof TFile && c.extension === "md" && !c.name.startsWith("_"),
  );
}

export function latestInFolder(app: App, folder: string): TFile | null {
  const f = getFolder(app, folder);
  if (!f) return null;
  const files = mdFiles(f).sort((a, b) => b.stat.mtime - a.stat.mtime);
  return files[0] ?? null;
}

function countFiles(folder: TFolder): number {
  let n = 0;
  for (const c of folder.children) {
    if (c instanceof TFile) n++;
    else if (c instanceof TFolder) n += countFiles(c);
  }
  return n;
}

function lastMtime(folder: TFolder): number {
  let latest = 0;
  for (const c of folder.children) {
    if (c instanceof TFile) { if (c.stat.mtime > latest) latest = c.stat.mtime; }
    else if (c instanceof TFolder) { const m = lastMtime(c); if (m > latest) latest = m; }
  }
  return latest;
}

export function listFolder(app: App, folder: string): FolderEntry[] {
  const f = getFolder(app, folder);
  if (!f) return [];
  const out: FolderEntry[] = [];
  for (const c of f.children) {
    if (c instanceof TFolder) {
      out.push({ name: c.name, path: c.path, isFolder: true, mtime: lastMtime(c), fileCount: countFiles(c) });
    } else if (c instanceof TFile) {
      out.push({ name: c.name, path: c.path, isFolder: false, mtime: c.stat.mtime, fileCount: 1 });
    }
  }
  out.sort((a, b) => Number(b.isFolder) - Number(a.isFolder) || a.name.localeCompare(b.name));
  return out;
}

export async function readNote(app: App, path: string): Promise<string> {
  const p = safeVaultPath(path);
  const f = app.vault.getAbstractFileByPath(normalizePath(p));
  if (!(f instanceof TFile)) throw new Error(`pinax: note not found: ${p}`);
  return app.vault.cachedRead(f);
}

function mdFilesDeep(folder: TFolder, out: TFile[]): void {
  for (const c of folder.children) {
    if (c instanceof TFile && c.extension === "md" && !c.name.startsWith("_")) out.push(c);
    else if (c instanceof TFolder) mdFilesDeep(c, out);
  }
}

export async function records(app: App, folder: string, recursive = false): Promise<NoteRecord[]> {
  const f = getFolder(app, folder);
  if (!f) return [];
  const files: TFile[] = [];
  if (recursive) mdFilesDeep(f, files);
  else files.push(...mdFiles(f));
  const out: NoteRecord[] = [];
  for (const file of files) {
    const cache = app.metadataCache.getFileCache(file);
    const fields: Record<string, unknown> = { ...(cache?.frontmatter ?? {}) };
    delete fields.position;
    out.push({ path: file.path, name: file.basename, mtime: file.stat.mtime, fields });
  }
  out.sort((a, b) => b.mtime - a.mtime);
  return out;
}

export async function recordsByTag(app: App, tags: string[]): Promise<NoteRecord[]> {
  const wanted = tags.map(normTag).filter((t) => t.length > 0);
  const out: NoteRecord[] = [];
  if (wanted.length === 0) return out;
  for (const file of app.vault.getMarkdownFiles()) {
    if (file.name.startsWith("_")) continue;
    const cache = app.metadataCache.getFileCache(file);
    const have = fileTags(cache);
    if (!wanted.every((t) => have.has(t) || Array.from(have).some((h) => h.startsWith(t + "/")))) continue;
    const fields: Record<string, unknown> = { ...(cache?.frontmatter ?? {}) };
    delete fields.position;
    out.push({ path: file.path, name: file.basename, mtime: file.stat.mtime, fields });
  }
  out.sort((a, b) => b.mtime - a.mtime);
  return out;
}

function normTag(t: unknown): string {
  return String(t ?? "").trim().replace(/^#/, "").toLowerCase();
}

interface TagCache {
  tags?: { tag: string }[];
  frontmatter?: Record<string, unknown>;
}

function fileTags(cache: TagCache | null | undefined): Set<string> {
  const out = new Set<string>();
  for (const t of cache?.tags ?? []) out.add(normTag(t.tag));
  const fm = cache?.frontmatter?.tags;
  if (Array.isArray(fm)) for (const t of fm) out.add(normTag(t));
  else if (typeof fm === "string") for (const t of fm.split(/[, ]+/)) if (t) out.add(normTag(t));
  return out;
}

export async function appendToNote(
  app: App,
  notePath: string,
  section: string | undefined,
  text: string,
): Promise<void> {
  const p = safeVaultPath(notePath);
  const f = app.vault.getAbstractFileByPath(normalizePath(p));
  if (!(f instanceof TFile)) {
    const dir = p.split("/").slice(0, -1).join("/");
    if (dir && !(app.vault.getAbstractFileByPath(normalizePath(dir)) instanceof TFolder)) {
      await app.vault.createFolder(normalizePath(dir));
    }
    const initial = section ? `${section}\n${text}\n` : `${text}\n`;
    await app.vault.create(normalizePath(p), initial);
    return;
  }
  await app.vault.process(f, (content) => {
    if (section) {
      const escaped = section.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const re = new RegExp(`(^${escaped}\\s*$)`, "m");
      if (re.test(content)) return content.replace(re, `$1\n${text}`);
      return content.trimEnd() + `\n\n${section}\n${text}\n`;
    }
    return content.trimEnd() + `\n${text}\n`;
  });
}

function sanitizeFilename(s: string): string {
  const cleaned = s.replace(/[\\/:*?"<>|#^[\]]/g, "").trim().slice(0, 120);
  return cleaned.length > 0 ? cleaned : "";
}

function yamlValue(v: unknown): string {
  const s = String(v ?? "");
  if (/^[A-Za-z0-9 ._@-]*$/.test(s)) return s;
  return JSON.stringify(s);
}

export async function createNote(
  app: App,
  folder: string,
  template: string | undefined,
  data: Record<string, unknown>,
  filenameFrom?: string,
): Promise<TFile> {
  const dir = safeVaultPath(folder);
  if (!(app.vault.getAbstractFileByPath(normalizePath(dir)) instanceof TFolder)) {
    await app.vault.createFolder(normalizePath(dir));
  }
  const nameField = filenameFrom ?? "name";
  const rawName = data[nameField] !== undefined ? String(data[nameField]) : "";
  const base = sanitizeFilename(rawName) || new Date().toISOString().replace(/[:.]/g, "-");

  let filePath = normalizePath(`${dir}/${base}.md`);
  let n = 2;
  while (app.vault.getAbstractFileByPath(filePath)) {
    filePath = normalizePath(`${dir}/${base}-${n}.md`);
    n++;
    if (n > 500) throw new Error("pinax: could not find a free filename");
  }

  const fmLines = ["---"];
  for (const [k, v] of Object.entries(data)) {
    if (v === undefined || v === null || String(v).length === 0) continue;
    fmLines.push(`${k}: ${yamlValue(v)}`);
  }
  fmLines.push(`created: ${new Date().toISOString().slice(0, 10)}`, "---", "");

  let body = template ?? "";
  body = body.replace(/\{\{(\w[\w-]*)\}\}/g, (_, key: string) =>
    data[key] !== undefined ? String(data[key]) : "",
  );

  return app.vault.create(filePath, fmLines.join("\n") + body + (body.endsWith("\n") || body === "" ? "" : "\n"));
}
