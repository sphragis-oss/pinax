import { Notice, Platform, Plugin, WorkspaceLeaf } from "obsidian";
import { WidgetRegistry } from "./core/registry";
import { ProfileStore } from "./core/profiles";
import { ProfileCodeLoader } from "./core/codeloader";
import { registerBuiltins } from "./core/widgets";
import { PinaxView, PINAX_VIEW_TYPE } from "./core/view";
import { PinaxSettingTab } from "./core/settings";
import { buildApi, PinaxApi } from "./core/api";
import type { PinaxHost } from "./core/host";
import { DEFAULT_SETTINGS, NO_TRUST, PinaxSettings, Profile, TrustSettings } from "./core/types";
import { buildMatcher } from "./core/live";
import { installPacks, bundledProfiles } from "./packs";

declare global {
  interface Window { pinax?: PinaxApi; }
}

interface LegacySettings {
  activeProfile?: string;
  trust?: Partial<TrustSettings>;
  profileTrust?: Record<string, Partial<TrustSettings>>;
}

function normalizeTrust(raw: Partial<TrustSettings> | undefined): TrustSettings {
  return {
    web: raw?.web === true,
    command: raw?.command === true,
    write: raw?.write === true,
    code: raw?.code === true,
  };
}

export default class PinaxPlugin extends Plugin implements PinaxHost {
  prefs: PinaxSettings = { ...DEFAULT_SETTINGS, profileTrust: {} };
  registry = new WidgetRegistry();
  store = new ProfileStore(this);
  profile: Profile | null = null;
  profileErrors: string[] = [];
  private api: PinaxApi | null = null;
  private codeLoader = new ProfileCodeLoader(this.registry, this.store);
  private stopWatch: (() => void) | null = null;
  private liveMatcher: ((path: string) => boolean) | null = null;
  private liveTimer: number | null = null;

  async onload(): Promise<void> {
    await this.loadSettings();

    registerBuiltins(this.registry);
    installPacks(this.registry);

    this.api = buildApi(this);
    window.pinax = this.api;

    this.registerView(PINAX_VIEW_TYPE, (leaf) => new PinaxView(leaf, this));
    this.addRibbonIcon("layout-dashboard", "Open Pinax", () => { void this.activate(); });
    this.addCommand({ id: "open", name: "Open dashboard", callback: () => { void this.activate(); } });
    this.addCommand({ id: "copy-diagnostics", name: "Copy diagnostics", callback: () => { void this.copyDiagnostics(); } });
    this.addSettingTab(new PinaxSettingTab(this.app, this));

    // obsidian://pinax?profile=<id>
    this.registerObsidianProtocolHandler("pinax", (params) => {
      void (async () => {
        const id = typeof params.profile === "string" ? params.profile : "";
        if (id && (await this.store.list()).includes(id)) await this.setActiveProfile(id);
        await this.activate();
      })();
    });

    // live refresh: re-render when a note the profile displays changes
    this.registerEvent(this.app.metadataCache.on("changed", (f) => this.touched(f.path)));
    this.registerEvent(this.app.vault.on("delete", (f) => this.touched(f.path)));
    this.registerEvent(this.app.vault.on("rename", (f, oldPath) => { this.touched(f.path); this.touched(oldPath); }));

    this.app.workspace.onLayoutReady(() => {
      void this.bootstrapProfiles();
    });
  }

  private async copyDiagnostics(): Promise<void> {
    const paneTypes: Record<string, number> = {};
    const panes = this.profile?.layout === "tabs"
      ? (this.profile.tabs ?? []).flatMap((t) => t.panes)
      : this.profile?.panes ?? [];
    for (const p of panes) paneTypes[p.type] = (paneTypes[p.type] ?? 0) + 1;
    const diag = {
      plugin: `${this.manifest.id} ${this.manifest.version}`,
      apiVersion: window.pinax?.apiVersion ?? null,
      platform: { mobile: Platform.isMobile, desktopApp: Platform.isDesktopApp },
      activeProfile: this.prefs.activeProfile,
      profiles: await this.store.list(),
      layout: this.profile?.layout ?? null,
      paneTypes,
      profileErrors: this.profileErrors,
      trust: this.activeTrust(),
    };
    await navigator.clipboard.writeText(JSON.stringify(diag, null, 2));
    new Notice("Pinax diagnostics copied to clipboard");
  }

  private touched(path: string): void {
    if (!path.endsWith(".md")) return;
    if (!this.liveMatcher || !this.liveMatcher(path)) return;
    if (this.liveTimer !== null) window.clearTimeout(this.liveTimer);
    this.liveTimer = window.setTimeout(() => {
      this.liveTimer = null;
      this.refreshViews();
    }, 800);
  }

  onunload(): void {
    this.stopWatch?.();
    this.stopWatch = null;
    if (this.liveTimer !== null) window.clearTimeout(this.liveTimer);
    this.liveTimer = null;
    this.codeLoader.unloadAll();
    if (window.pinax === this.api) delete window.pinax;
  }

  activeTrust(): TrustSettings {
    return this.prefs.profileTrust[this.prefs.activeProfile] ?? NO_TRUST;
  }

  ensureTrust(id: string): TrustSettings {
    if (!this.prefs.profileTrust[id]) {
      this.prefs.profileTrust[id] = { ...NO_TRUST };
    }
    return this.prefs.profileTrust[id];
  }

  private async bootstrapProfiles(): Promise<void> {
    try {
      await this.store.ensureDefaults(bundledProfiles);
    } catch (err) {
      console.error("pinax: failed to materialize bundled profiles", err);
    }
    const ids = await this.store.list();
    if (!this.prefs.activeProfile || !ids.includes(this.prefs.activeProfile)) {
      const preferred = Object.keys(bundledProfiles).find((id) => ids.includes(id));
      this.prefs.activeProfile = preferred ?? ids[0] ?? "";
      await this.saveSettings();
    }
    await this.reloadProfile();
    this.startWatch();
  }

  async reloadProfile(): Promise<void> {
    const id = this.prefs.activeProfile;
    if (!id) {
      this.profile = null;
      this.profileErrors = ["no profile is active; add one under the plugin's profiles/ folder"];
      this.liveMatcher = null;
      this.codeLoader.unloadAll();
      this.refreshViews();
      return;
    }
    const res = await this.store.read(id);
    this.profile = res.profile;
    this.profileErrors = res.errors;
    this.liveMatcher = res.profile ? buildMatcher(res.profile, this.app) : null;
    if (this.api) {
      await this.codeLoader.load(id, this.api, this.activeTrust().code);
    }
    this.refreshViews();
  }

  async setActiveProfile(id: string): Promise<void> {
    this.prefs.activeProfile = id;
    await this.saveSettings();
    await this.reloadProfile();
    this.startWatch();
  }

  private startWatch(): void {
    this.stopWatch?.();
    this.stopWatch = null;
    if (!this.prefs.activeProfile) return;
    this.stopWatch = this.store.watch(this.prefs.activeProfile, () => { void this.reloadProfile(); });
  }

  refreshViews(): void {
    for (const leaf of this.app.workspace.getLeavesOfType(PINAX_VIEW_TYPE)) {
      const view = leaf.view;
      if (view instanceof PinaxView) view.queueRender();
    }
  }

  async loadSettings(): Promise<void> {
    const raw = ((await this.loadData()) ?? {}) as LegacySettings;
    const activeProfile = typeof raw.activeProfile === "string" ? raw.activeProfile : "";
    const profileTrust: Record<string, TrustSettings> = {};
    for (const [id, t] of Object.entries(raw.profileTrust ?? {})) {
      profileTrust[id] = normalizeTrust(t);
    }
    // migrate pre-per-profile global trust onto the active profile
    if (raw.trust && activeProfile && !profileTrust[activeProfile]) {
      profileTrust[activeProfile] = normalizeTrust(raw.trust);
    }
    this.prefs = { activeProfile, profileTrust };
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.prefs);
  }

  async activate(): Promise<void> {
    const { workspace } = this.app;
    let leaf: WorkspaceLeaf | null = workspace.getLeavesOfType(PINAX_VIEW_TYPE)[0] ?? null;
    if (!leaf) {
      leaf = workspace.getLeaf("tab");
      await leaf.setViewState({ type: PINAX_VIEW_TYPE, active: true });
    }
    await workspace.revealLeaf(leaf);
  }
}
