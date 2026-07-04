// Minimal Obsidian API mock, enough to load the bundled main.js headlessly.
import { JSDOM } from "jsdom";

export const notices = [];
export const clipboard = { last: null };

// mutable so the harness can simulate mobile
export const Platform = { isDesktopApp: true, isMobileApp: false, isMobile: false, isMacOS: true };

export function setupDom() {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    url: "http://localhost/",
    pretendToBeVisual: true,
  });
  const { window } = dom;
  globalThis.window = window;
  globalThis.document = window.document;
  globalThis.HTMLElement = window.HTMLElement;
  globalThis.HTMLInputElement = window.HTMLInputElement;
  globalThis.HTMLTextAreaElement = window.HTMLTextAreaElement;
  globalThis.HTMLSelectElement = window.HTMLSelectElement;
  globalThis.localStorage = window.localStorage;
  globalThis.activeDocument = window.document;
  globalThis.activeWindow = window;
  globalThis.createSvg = (tag) => window.document.createElementNS("http://www.w3.org/2000/svg", tag);
  globalThis.DOMParser = window.DOMParser;
  globalThis.getComputedStyle = window.getComputedStyle.bind(window);
  Object.defineProperty(window.navigator, "clipboard", {
    value: { writeText: async (t) => { clipboard.last = t; } },
    configurable: true,
  });
  Object.defineProperty(globalThis, "navigator", { value: window.navigator, configurable: true });
  polyfillObsidianDom(window);
  return dom;
}

function applyOpts(el, o) {
  if (typeof o === "string") { el.className = o; return; }
  if (!o) return;
  if (o.cls) el.className = Array.isArray(o.cls) ? o.cls.join(" ") : o.cls;
  if (o.text !== undefined) el.textContent = String(o.text);
  if (o.value !== undefined) el.value = o.value;
  if (o.attr) for (const [k, v] of Object.entries(o.attr)) el.setAttribute(k, String(v));
}

function polyfillObsidianDom(window) {
  const proto = window.HTMLElement.prototype;
  const doc = window.document;
  proto.createEl = function (tag, o) { const el = doc.createElement(tag); applyOpts(el, o); this.appendChild(el); return el; };
  proto.createDiv = function (o) { return this.createEl("div", o); };
  proto.createSpan = function (o) { return this.createEl("span", o); };
  proto.empty = function () { while (this.firstChild) this.removeChild(this.firstChild); };
  proto.setText = function (t) { this.textContent = String(t); };
  proto.appendText = function (t) { this.appendChild(doc.createTextNode(String(t))); };
  proto.setAttr = function (k, v) { this.setAttribute(k, String(v)); };
  proto.addClass = function (...c) { this.classList.add(...c); };
  proto.removeClass = function (...c) { this.classList.remove(...c); };
  proto.toggleClass = function (c, v) { this.classList.toggle(c, v); };
  proto.hasClass = function (c) { return this.classList.contains(c); };
  proto.hide = function () { this.style.display = "none"; };
  proto.show = function () { this.style.display = ""; };
  proto.isShown = function () { return this.style.display !== "none"; };
}

export function normalizePath(p) {
  return String(p).replace(/\\/g, "/").replace(/\/+/g, "/").replace(/^\//, "").replace(/\/$/, "");
}

export class TAbstractFile {
  constructor(vault, path) { this.vault = vault; this.path = path; }
  get name() { return this.path.split("/").pop() ?? this.path; }
}

export class TFile extends TAbstractFile {
  get extension() { const i = this.name.lastIndexOf("."); return i === -1 ? "" : this.name.slice(i + 1); }
  get basename() { const n = this.name; const i = n.lastIndexOf("."); return i === -1 ? n : n.slice(0, i); }
  get stat() { const e = this.vault.store.get(this.path); return { mtime: e?.mtime ?? 0, ctime: e?.ctime ?? 0, size: e?.content?.length ?? 0 }; }
}

export class TFolder extends TAbstractFile {
  get children() {
    const out = [];
    const prefix = this.path === "" ? "" : this.path + "/";
    for (const [p] of this.vault.store) {
      if (!p.startsWith(prefix) || p === this.path) continue;
      const rest = p.slice(prefix.length);
      if (rest.includes("/")) continue;
      out.push(this.vault.getAbstractFileByPath(p));
    }
    return out;
  }
}

class MockAdapter {
  constructor(vault) { this.vault = vault; }
  async exists(p) { return this.vault.store.has(normalizePath(p)); }
  async mkdir(p) { this.vault.ensureDir(normalizePath(p)); }
  async read(p) {
    const e = this.vault.store.get(normalizePath(p));
    if (!e || e.type !== "file") throw new Error(`ENOENT: ${p}`);
    return e.content;
  }
  async write(p, content) { this.vault.putFile(normalizePath(p), content); }
  async stat(p) {
    const e = this.vault.store.get(normalizePath(p));
    if (!e) return null;
    return { type: e.type === "file" ? "file" : "folder", mtime: e.mtime, ctime: e.ctime, size: e.content?.length ?? 0 };
  }
  async list(p) {
    const norm = normalizePath(p);
    const prefix = norm === "" ? "" : norm + "/";
    const files = [], folders = [];
    for (const [path, e] of this.vault.store) {
      if (!path.startsWith(prefix) || path === norm) continue;
      const rest = path.slice(prefix.length);
      if (rest.includes("/")) continue;
      (e.type === "file" ? files : folders).push(path);
    }
    return { files, folders };
  }
}

function parseSimpleFrontmatter(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!m) return undefined;
  const fm = {};
  for (const line of m[1].split("\n")) {
    const idx = line.indexOf(":");
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    let val = line.slice(idx + 1).trim();
    if (/^".*"$/.test(val)) val = val.slice(1, -1);
    fm[key] = val;
  }
  return fm;
}

export class MockVault {
  constructor() {
    this.store = new Map();
    this.store.set("", { type: "dir", mtime: 0, ctime: 0 });
    this.adapter = new MockAdapter(this);
    this.fileCache = new Map();
    this.eventHandlers = {};
  }
  getName() { return "mock-vault"; }
  on(name, cb) { (this.eventHandlers[name] ??= []).push(cb); return { name, cb }; }
  emit(name, ...args) { for (const cb of this.eventHandlers[name] ?? []) cb(...args); }
  ensureDir(p) {
    const parts = normalizePath(p).split("/").filter(Boolean);
    let cur = "";
    for (const part of parts) {
      cur = cur === "" ? part : `${cur}/${part}`;
      if (!this.store.has(cur)) this.store.set(cur, { type: "dir", mtime: Date.now(), ctime: Date.now() });
    }
  }
  putFile(p, content, mtime) {
    // default mtimes are strictly increasing so "latest" checks never tie
    if (mtime === undefined) {
      this.mtimeClock = Math.max((this.mtimeClock ?? 0) + 1, Date.now());
      mtime = this.mtimeClock;
    }
    const norm = normalizePath(p);
    const dir = norm.split("/").slice(0, -1).join("/");
    if (dir) this.ensureDir(dir);
    const prev = this.store.get(norm);
    this.store.set(norm, { type: "file", content, mtime, ctime: prev?.ctime ?? mtime });
    this.emit(prev ? "modify" : "create", this.getAbstractFileByPath(norm));
    this.emit("mc-changed", this.getAbstractFileByPath(norm));
  }
  getAbstractFileByPath(p) {
    const norm = normalizePath(p);
    const e = this.store.get(norm);
    if (!e) return null;
    let f = this.fileCache.get(norm);
    if (!f) {
      f = e.type === "file" ? new TFile(this, norm) : new TFolder(this, norm);
      this.fileCache.set(norm, f);
    }
    return f;
  }
  async cachedRead(file) { return this.adapter.read(file.path); }
  async read(file) { return this.adapter.read(file.path); }
  async modify(file, content) { this.putFile(file.path, content); }
  async process(file, fn) {
    const e = this.store.get(normalizePath(file.path));
    if (!e || e.type !== "file") throw new Error(`no file: ${file.path}`);
    const out = fn(e.content);
    this.putFile(file.path, out);
    return out;
  }
  async create(path, content) {
    const norm = normalizePath(path);
    if (this.store.has(norm)) throw new Error(`file exists: ${norm}`);
    this.putFile(norm, content);
    return this.getAbstractFileByPath(norm);
  }
  async createFolder(path) { this.ensureDir(path); }
  getMarkdownFiles() {
    const out = [];
    for (const [p, e] of this.store) {
      if (e.type === "file" && p.endsWith(".md")) out.push(this.getAbstractFileByPath(p));
    }
    return out;
  }
}

class MockLeaf {
  constructor(app) { this.app = app; this.view = null; }
  async setViewState(state) {
    const factory = this.app.viewFactories[state.type];
    if (!factory) throw new Error(`no view factory for ${state.type}`);
    this.view = factory(this);
    this.view.__viewType = state.type;
    this.app.workspace.leaves.push(this);
    await this.view.onOpen?.();
  }
}

class MockWorkspace {
  constructor(app) { this.app = app; this.leaves = []; this.opened = []; this.layoutReadyCbs = []; }
  onLayoutReady(cb) { cb(); }
  getLeavesOfType(type) { return this.leaves.filter((l) => l.view?.__viewType === type); }
  iterateAllLeaves(cb) { for (const l of this.leaves) cb(l); }
  revealLeaf() {}
  getLeaf() { return new MockLeaf(this.app); }
  openLinkText(path) { this.opened.push(path); }
  getActiveViewOfType(_cls) { return null; }
  detachLeavesOfType(type) { this.leaves = this.leaves.filter((l) => l.view?.__viewType !== type); }
}

export class App {
  loadLocalStorage(key) { const v = this.localStore.get(key); return v === undefined ? null : v; }
  saveLocalStorage(key, data) { if (data === null || data === undefined) this.localStore.delete(key); else this.localStore.set(key, data); }
  constructor() {
    this.localStore = new Map();
    this.vault = new MockVault();
    this.viewFactories = {};
    this.workspace = new MockWorkspace(this);
    this.metadataCache = {
      getFileCache: (file) => {
        const e = this.vault.store.get(file.path);
        if (!e || e.type !== "file") return null;
        const body = e.content.replace(/^---\n[\s\S]*?\n---\n?/, "");
        const tags = Array.from(body.matchAll(/#([A-Za-z0-9_/-]+)/g)).map((m) => ({ tag: `#${m[1]}` }));
        return { frontmatter: parseSimpleFrontmatter(e.content), tags };
      },
      on: (name, cb) => this.vault.on(`mc-${name}`, cb),
    };
    this.commands = { executeCommandById: () => true };
    this.fileManager = {
      processFrontMatter: async (file, fn) => {
        const e = this.vault.store.get(file.path);
        if (!e || e.type !== "file") throw new Error(`no file: ${file.path}`);
        const fm = parseSimpleFrontmatter(e.content) ?? {};
        fn(fm);
        const body = e.content.startsWith("---\n")
          ? e.content.slice(e.content.indexOf("\n---", 4) + 5)
          : e.content;
        const lines = ["---"];
        for (const [k, v] of Object.entries(fm)) {
          if (v !== undefined && v !== null) lines.push(`${k}: ${v}`);
        }
        lines.push("---");
        this.vault.putFile(file.path, lines.join("\n") + "\n" + body);
      },
    };
  }
}

export class Plugin {
  constructor(app, manifest) { this.app = app; this.manifest = manifest; }
  registerView(type, factory) { this.app.viewFactories[type] = factory; }
  addRibbonIcon() { return { remove() {} }; }
  addCommand(cmd) { (this.__commands ??= []).push(cmd); }
  addSettingTab(tab) { this.__settingTab = tab; }
  registerObsidianProtocolHandler(action, cb) { (this.__protocolHandlers ??= {})[action] = cb; }
  registerEvent() {}
  registerDomEvent() {}
  async loadData() { return this.__data ?? null; }
  async saveData(d) { this.__data = JSON.parse(JSON.stringify(d)); }
}

export class ItemView {
  constructor(leaf) {
    this.leaf = leaf;
    this.app = leaf.app;
    this.containerEl = globalThis.document.createElement("div");
    this.containerEl.createDiv({ cls: "view-header" });
    this.containerEl.createDiv({ cls: "view-content" });
  }
  registerDomEvent() {}
}

export class WorkspaceLeaf {}

export class PluginSettingTab {
  constructor(app, plugin) {
    this.app = app;
    this.plugin = plugin;
    this.containerEl = globalThis.document.createElement("div");
  }
  display() {}
}

export const settingControls = [];

export class Setting {
  constructor(el) {
    this.settingEl = el.createDiv({ cls: "setting-item" });
    this.__name = "";
  }
  setName(n) { this.__name = String(n); return this; }
  setDesc() { return this; }
  setHeading() { return this; }
  addDropdown(cb) {
    const dd = {
      __options: [], __value: "",
      addOption(v) { this.__options.push(v); return this; },
      setValue(v) { this.__value = v; return this; },
      onChange(f) { this.__onChange = f; return this; },
    };
    cb(dd);
    settingControls.push({ setting: this.__name, kind: "dropdown", control: dd });
    return this;
  }
  addText(cb) {
    const input = globalThis.document.createElement("input");
    const t = {
      inputEl: input,
      getValue() { return input.value; },
      setValue(v) { input.value = v; return this; },
      setPlaceholder() { return this; },
      onChange(f) { this.__onChange = f; return this; },
    };
    cb(t);
    settingControls.push({ setting: this.__name, kind: "text", control: t });
    return this;
  }
  addToggle(cb) {
    const t = { __value: false, setValue(v) { this.__value = v; return this; }, onChange(f) { this.__onChange = f; return this; } };
    cb(t);
    settingControls.push({ setting: this.__name, kind: "toggle", control: t });
    return this;
  }
  addButton(cb) {
    const b = {
      __text: "", __disabled: false,
      setButtonText(t) { this.__text = t; return this; }, setCta() { return this; },
      setDisabled(d) { this.__disabled = d; return this; },
      onClick(f) { this.__onClick = f; return this; },
    };
    cb(b);
    settingControls.push({ setting: this.__name, kind: "button", control: b });
    return this;
  }
  addExtraButton(cb) {
    const b = {
      __icon: "", __tooltip: "",
      setIcon(i) { this.__icon = i; return this; }, setTooltip(t) { this.__tooltip = t; return this; },
      onClick(f) { this.__onClick = f; return this; },
    };
    cb(b);
    settingControls.push({ setting: this.__name, kind: "extra", control: b });
    return this;
  }
  addTextArea(cb) {
    const t = {
      inputEl: globalThis.document.createElement("textarea"),
      setPlaceholder() { return this; }, onChange(f) { this.__onChange = f; return this; },
    };
    cb(t);
    settingControls.push({ setting: this.__name, kind: "textarea", control: t });
    return this;
  }
}

export class Modal {
  constructor(app) {
    this.app = app;
    this.contentEl = globalThis.document.createElement("div");
    this.titleEl = globalThis.document.createElement("div");
    polyfillNoop(this.contentEl);
    polyfillNoop(this.titleEl);
  }
  open() { Modal.__open = this; this.onOpen?.(); }
  close() { this.onClose?.(); Modal.__open = null; }
}
function polyfillNoop() {}

export class Menu {
  constructor() { this.items = []; Menu.last = this; }
  addItem(cb) {
    const item = { title: "", setTitle(t) { this.title = t; return this; }, onClick(f) { this.__onClick = f; return this; } };
    cb(item);
    this.items.push(item);
    return this;
  }
  showAtMouseEvent() {}
}

export class Notice {
  constructor(msg) {
    notices.push(String(msg));
    this.noticeEl = globalThis.document.createElement("div");
    Notice.last = this;
  }
  hide() {}
}

export const MarkdownRenderer = {
  async render(app, md, el) { el.createDiv({ cls: "px-mock-md", text: md }); },
};

export function setIcon(el, icon) { el.setAttribute("data-icon", icon); }

export class FileSystemAdapter {}

export function requestUrl() { return Promise.reject(new Error("network disabled in mock")); }
