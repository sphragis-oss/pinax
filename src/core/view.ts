import { ItemView, WorkspaceLeaf } from "obsidian";
import type { PinaxHost } from "./host";
import type { PaneConfig, TrustGate, WidgetCleanup } from "./types";
import { isTrusted, gateLabel } from "./trust";
import { currentTheme, openThemePicker, allThemes, DEFAULT_THEME, THEME_STORAGE_KEY } from "./themes";
import { placeholderEl, errorEl } from "./ui";

export const PINAX_VIEW_TYPE = "pinax-view";

interface PaletteItem { group: string; label: string; run: () => void; }

export class PinaxView extends ItemView {
  private host: PinaxHost;
  private activeTabId: string | null = null;
  private disposeRegistryHook: (() => void) | null = null;
  private renderQueued = false;
  private cleanups: WidgetCleanup[] = [];

  constructor(leaf: WorkspaceLeaf, host: PinaxHost) {
    super(leaf);
    this.host = host;
  }

  getViewType(): string { return PINAX_VIEW_TYPE; }
  getDisplayText(): string { return this.host.profile?.name ?? "Pinax"; }
  getIcon(): string { return "layout-dashboard"; }

  async onOpen(): Promise<void> {
    this.registerDomEvent(document, "keydown", (e) => this.onKey(e));
    this.disposeRegistryHook = this.host.registry.onChanged(() => this.queueRender());
    await this.render();
  }

  async onClose(): Promise<void> {
    this.runCleanups();
    this.disposeRegistryHook?.();
    this.disposeRegistryHook = null;
  }

  queueRender(): void {
    if (this.renderQueued) return;
    this.renderQueued = true;
    window.setTimeout(() => {
      this.renderQueued = false;
      void this.render();
    }, 50);
  }

  private runCleanups(): void {
    for (const c of this.cleanups) {
      try { c(); } catch (err) { console.error("pinax: widget cleanup failed", err); }
    }
    this.cleanups = [];
  }

  private onKey(e: KeyboardEvent): void {
    if (this.app.workspace.getActiveViewOfType(PinaxView) !== this) return;
    const root = this.containerEl.children[1] as HTMLElement | undefined;
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
      e.preventDefault();
      if (root) this.openPalette(root);
      return;
    }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
    if (root?.querySelector(".cc-theme-overlay") || root?.querySelector(".cc-cmdk-overlay")) return;
    if (e.key === "r") { e.preventDefault(); void this.render(); return; }
    if (e.key === "t" && root) { e.preventDefault(); openThemePicker(root, () => void this.render()); return; }
    const tabs = this.host.profile?.layout === "tabs" ? this.host.profile.tabs ?? [] : [];
    if (tabs.length > 0 && e.key >= "1" && e.key <= "9") {
      const tab = tabs[Number(e.key) - 1];
      if (tab) { e.preventDefault(); this.activeTabId = tab.id; void this.render(); }
    }
  }

  async render(): Promise<void> {
    this.runCleanups();
    const root = this.containerEl.children[1] as HTMLElement;
    root.empty();
    root.addClass("cc-root", "px-root");
    if (localStorage.getItem("cc-density") === "compact") root.addClass("cc-density-compact");
    else root.removeClass("cc-density-compact");
    root.setAttribute("data-cc-theme", localStorage.getItem(THEME_STORAGE_KEY) || DEFAULT_THEME);

    (this.leaf as unknown as { updateHeader?: () => void }).updateHeader?.();

    this.renderTopbar(root);
    const body = root.createDiv({ cls: "cc-body px-body" });

    const profile = this.host.profile;
    if (this.host.profileErrors.length > 0 || !profile) {
      const ids = await this.host.store.list();
      if (!this.host.settings.activeProfile) {
        this.renderOnboarding(body, ids);
        return;
      }
      const box = body.createDiv({ cls: "px-error" });
      box.createDiv({ text: "profile failed to load", cls: "px-placeholder-title" });
      const list = box.createEl("ul", { cls: "px-error-list" });
      const errors = this.host.profileErrors.length > 0 ? this.host.profileErrors : ["no profile is active"];
      for (const err of errors) list.createEl("li", { text: err });
      box.createDiv({
        text: "Fix profile.json (it hot-reloads on save) or switch profiles in Settings → Pinax.",
        cls: "px-placeholder-msg",
      });
      const openBtn = box.createEl("button", { text: "Open profile.json", cls: "px-btn" });
      openBtn.onclick = () => {
        const path = this.host.store.profilePath(this.host.settings.activeProfile);
        const opener = (this.app as unknown as { openWithDefaultApp?: (p: string) => void }).openWithDefaultApp;
        if (opener) opener.call(this.app, path);
        else navigator.clipboard?.writeText(path).catch(() => { /* path shown below anyway */ });
      };
      box.createDiv({ text: this.host.store.profilePath(this.host.settings.activeProfile), cls: "px-placeholder-msg" });
      const others = ids.filter((i) => i !== this.host.settings.activeProfile);
      if (others.length > 0) {
        const row = box.createDiv({ cls: "px-onboard-row" });
        for (const id of others) {
          const btn = row.createEl("button", { text: `Switch to ${id}`, cls: "px-btn" });
          btn.onclick = () => { void this.host.setActiveProfile(id); };
        }
      }
      return;
    }

    if (profile.layout === "tabs") {
      const tabs = profile.tabs ?? [];
      if (!this.activeTabId || !tabs.some((t) => t.id === this.activeTabId)) {
        this.activeTabId = tabs[0]?.id ?? null;
      }
      const bar = body.createDiv({ cls: "cc-tabs" });
      for (const tab of tabs) {
        const el = bar.createEl("button", {
          text: tab.label,
          cls: "cc-tab" + (this.activeTabId === tab.id ? " cc-tab-active" : ""),
        });
        el.onclick = () => { this.activeTabId = tab.id; void this.render(); };
      }
      const active = tabs.find((t) => t.id === this.activeTabId);
      await this.renderPanes(body, active?.panes ?? []);
    } else {
      await this.renderPanes(body, profile.panes ?? []);
    }
    this.wireCollapse(root);
  }

  private renderOnboarding(body: HTMLElement, ids: string[]): void {
    const box = body.createDiv({ cls: "px-onboard" });
    box.createDiv({ text: "❯ welcome to pinax", cls: "px-onboard-title" });
    box.createDiv({
      text: "Every dashboard is a profile: a profile.json you can edit, share, and hot-reload. Pick one to get started; you can switch any time in Settings → Pinax.",
      cls: "px-placeholder-msg",
    });
    if (ids.length === 0) {
      box.createDiv({
        text: "No profiles found yet. Bundled profiles are created on startup under the plugin folder's profiles/ directory.",
        cls: "px-placeholder-msg",
      });
      return;
    }
    const row = box.createDiv({ cls: "px-onboard-row" });
    for (const id of ids) {
      const btn = row.createEl("button", { text: id, cls: "px-btn px-btn-primary" });
      btn.onclick = () => { void this.host.setActiveProfile(id); };
    }
  }

  private renderTopbar(root: HTMLElement): void {
    const bar = root.createDiv({ cls: "cc-hero__titlebar px-topbar" });
    bar.createDiv({ cls: "cc-hero__dots" });
    bar.createSpan({ text: `~/pinax · ${this.host.profile?.name ?? "no profile"}`, cls: "cc-hero__path" });
    const actions = bar.createDiv({ cls: "cc-hero__actions" });

    const cur = currentTheme();
    const themeBtn = actions.createEl("button", { cls: "cc-theme-btn" });
    themeBtn.createSpan({ cls: "cc-theme-btn__swatch" }).style.background = cur.accent;
    themeBtn.createSpan({ text: cur.label });
    themeBtn.title = "Switch theme (t)";
    themeBtn.onclick = () => openThemePicker(root, () => void this.render());

    const cmdkBtn = actions.createEl("button", { cls: "cc-theme-btn", text: "⌘K" });
    cmdkBtn.title = "Command palette (⌘K)";
    cmdkBtn.onclick = () => this.openPalette(root);

    const isCompact = localStorage.getItem("cc-density") === "compact";
    const density = actions.createEl("button", { text: isCompact ? "▣" : "▤", cls: "cc-density-btn" });
    density.title = "Toggle pane density";
    density.onclick = () => {
      if (localStorage.getItem("cc-density") === "compact") localStorage.removeItem("cc-density");
      else localStorage.setItem("cc-density", "compact");
      void this.render();
    };

    const refresh = actions.createEl("button", { text: "↻", cls: "cc-refresh" });
    refresh.title = "Refresh (r)";
    refresh.onclick = () => { void this.render(); };
  }

  private buildPaletteItems(profileIds: string[]): PaletteItem[] {
    const items: PaletteItem[] = [];
    const tabs = this.host.profile?.layout === "tabs" ? this.host.profile.tabs ?? [] : [];
    for (const t of tabs) {
      items.push({ group: "tab", label: `Go to ${t.label}`, run: () => { this.activeTabId = t.id; void this.render(); } });
    }
    for (const id of profileIds) {
      if (id === this.host.settings.activeProfile) continue;
      items.push({ group: "profile", label: `Switch profile: ${id}`, run: () => { void this.host.setActiveProfile(id); } });
    }
    items.push({ group: "action", label: "Refresh", run: () => void this.render() });
    items.push({
      group: "action", label: "Toggle density", run: () => {
        if (localStorage.getItem("cc-density") === "compact") localStorage.removeItem("cc-density");
        else localStorage.setItem("cc-density", "compact");
        void this.render();
      },
    });
    for (const t of allThemes()) {
      items.push({ group: "theme", label: `Theme: ${t.label}`, run: () => { localStorage.setItem(THEME_STORAGE_KEY, t.id); void this.render(); } });
    }
    for (const f of this.app.vault.getMarkdownFiles()) {
      items.push({ group: "note", label: `Open ${f.path}`, run: () => void this.app.workspace.openLinkText(f.path, "", false) });
    }
    return items;
  }

  private openPalette(root: HTMLElement): void {
    if (root.querySelector(".cc-cmdk-overlay")) return;
    void this.host.store.list().then((profileIds) => {
      const items = this.buildPaletteItems(profileIds);
      const overlay = root.createDiv({ cls: "cc-cmdk-overlay cc-open" });
      const modal = overlay.createDiv({ cls: "cc-cmdk-modal" });
      const bar = modal.createDiv({ cls: "cc-cmdk-bar" });
      bar.createSpan({ text: "❯", cls: "cc-hero__prompt" });
      const input = bar.createEl("input", { cls: "cc-cmdk-input" });
      input.placeholder = "jump to a tab, switch profile, open a note, switch theme…";
      const list = modal.createDiv({ cls: "cc-cmdk-list" });

      let filtered = items;
      let sel = 0;
      const close = (): void => { overlay.remove(); document.removeEventListener("keydown", onKey, true); };
      const run = (it: PaletteItem): void => { close(); it.run(); };
      const highlight = (): void => {
        list.querySelectorAll(".cc-cmdk-item").forEach((el, i) => el.toggleClass("cc-cmdk-sel", i === sel));
        (list.children[sel] as HTMLElement | undefined)?.scrollIntoView({ block: "nearest" });
      };
      const draw = (): void => {
        list.empty();
        filtered.forEach((it, i) => {
          const row = list.createDiv({ cls: "cc-cmdk-item" + (i === sel ? " cc-cmdk-sel" : "") });
          row.createSpan({ text: it.group, cls: "cc-cmdk-group" });
          row.createSpan({ text: it.label, cls: "cc-cmdk-label" });
          row.onmouseenter = () => { sel = i; highlight(); };
          row.onclick = () => run(it);
        });
      };
      const applyFilter = (): void => {
        const q = input.value.toLowerCase().trim();
        filtered = (q === "" ? items : items.filter((it) => (it.group + " " + it.label).toLowerCase().includes(q))).slice(0, 60);
        sel = 0;
        draw();
      };
      const onKey = (e: KeyboardEvent): void => {
        if (e.key === "Escape") { e.preventDefault(); close(); }
        else if (e.key === "ArrowDown") { e.preventDefault(); sel = Math.min(sel + 1, filtered.length - 1); highlight(); }
        else if (e.key === "ArrowUp") { e.preventDefault(); sel = Math.max(sel - 1, 0); highlight(); }
        else if (e.key === "Enter") { e.preventDefault(); if (filtered[sel]) run(filtered[sel]); }
      };
      overlay.onclick = (e) => { if (e.target === overlay) close(); };
      input.oninput = applyFilter;
      document.addEventListener("keydown", onKey, true);
      applyFilter();
      window.setTimeout(() => input.focus(), 0);
    });
  }

  private async renderPanes(container: HTMLElement, panes: PaneConfig[]): Promise<void> {
    const grid = container.createDiv({ cls: "cc-grid px-grid" });
    if (panes.length === 0) {
      placeholderEl(grid, "no panes", "This profile has no panes yet. Add some in Settings → Pinax.");
      return;
    }
    for (const pane of panes) {
      await this.renderPane(grid, pane);
    }
  }

  private async renderPane(grid: HTMLElement, pane: PaneConfig): Promise<void> {
    const wide = pane.width === "full";
    let bodyEl: HTMLElement;
    if (pane.frame === false) {
      bodyEl = grid.createDiv({ cls: "px-bare" + (wide ? "" : " px-bare-half") });
    } else {
      const paneEl = grid.createDiv({ cls: "cc-pane" + (wide ? " cc-pane-wide" : "") });
      paneEl.createEl("h3", { text: pane.title ?? pane.type });
      bodyEl = paneEl.createDiv({ cls: "px-pane-body" });
    }

    const spec = this.host.registry.get(pane.type);
    if (!spec) {
      placeholderEl(bodyEl, `unknown pane type "${pane.type}"`, "Check profile.json against profile.schema.json.");
      return;
    }
    const trust = this.host.activeTrust();
    if (!isTrusted(spec.gate, trust)) {
      const gate = spec.gate as TrustGate;
      placeholderEl(
        bodyEl,
        `${gateLabel(gate)} is disabled`,
        `This pane needs the "${gate}" capability, which is off by default for every profile. Enable it for this profile in Settings → Pinax if you trust it.`,
      );
      return;
    }
    const ctx = {
      app: this.app,
      component: this,
      pane,
      trust,
      refresh: () => this.queueRender(),
      openNote: (path: string) => { void this.app.workspace.openLinkText(path, "", false); },
    };
    let paneCleanup: WidgetCleanup | null = null;
    const runRender = async (): Promise<void> => {
      try { paneCleanup?.(); } catch (err) { console.error("pinax: widget cleanup failed", err); }
      paneCleanup = null;
      bodyEl.empty();
      try {
        const cleanup = await spec.render(bodyEl, ctx);
        if (typeof cleanup === "function") paneCleanup = cleanup;
      } catch (err) {
        console.error(`pinax: pane "${pane.type}" failed to render`, err);
        errorEl(bodyEl, String(err));
      }
    };
    await runRender();
    this.cleanups.push(() => {
      try { paneCleanup?.(); } catch (err) { console.error("pinax: widget cleanup failed", err); }
    });
    const sec = Number(pane.refreshSec) || 0;
    if (sec >= 5) {
      const timer = window.setInterval(() => { void runRender(); }, sec * 1000);
      this.cleanups.push(() => window.clearInterval(timer));
    }
  }

  private wireCollapse(root: HTMLElement): void {
    root.querySelectorAll(".cc-pane").forEach((p) => {
      const pane = p as HTMLElement;
      const h3 = pane.querySelector("h3") as HTMLElement | null;
      if (!h3) return;
      const rawKey = (h3.textContent || "").trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
      const storageKey = `cc-collapse:${rawKey}`;
      if (localStorage.getItem(storageKey) === "1") pane.addClass("cc-collapsed");
      if (!h3.hasAttribute("data-cc-wired")) {
        h3.setAttribute("data-cc-wired", "1");
        h3.addEventListener("click", () => {
          if (pane.hasClass("cc-collapsed")) {
            pane.removeClass("cc-collapsed");
            localStorage.removeItem(storageKey);
          } else {
            pane.addClass("cc-collapsed");
            localStorage.setItem(storageKey, "1");
          }
        });
      }
    });
  }
}
