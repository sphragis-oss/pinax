import { App, Modal, Notice, Platform, Plugin, PluginSettingTab, Setting, requestUrl } from "obsidian";
import type { SettingDefinitionItem } from "obsidian";
import type { PinaxHost } from "./host";
import type { PaneConfig, Profile, TrustGate } from "./types";
import { validateProfile } from "./validate";
import { TERMINAL_PREF_KEY, currentTerminalPlatform, macAppDetected } from "./terminal";
import { terminalChoices } from "./terminal-apps";
import schema from "../../profile.schema.json";

type PinaxPluginLike = Plugin & PinaxHost;

interface SchemaProp {
  type?: string;
  const?: unknown;
  enum?: string[];
  description?: string;
  $ref?: string;
  oneOf?: unknown[];
  minimum?: number;
}

interface PaneDef {
  properties: Record<string, SchemaProp>;
  required?: string[];
}

function paneDefFor(type: string): PaneDef | null {
  const defs = (schema as unknown as { definitions: Record<string, PaneDef> }).definitions;
  for (const def of Object.values(defs)) {
    if (def.properties?.type?.const === type) return def;
  }
  return null;
}

const GATES: TrustGate[] = ["web", "command", "write"];

const TRUST_INTRO = "Trust is granted per profile and every toggle starts OFF. A newly imported profile never inherits trust you gave another one. Only enable capabilities for profiles you trust.";

const GATE_META: Record<TrustGate, { name: string; desc: string }> = {
  web: { name: "Web embeds (iframe)", desc: "Allows iframe panes to load external https:// pages inside your vault window." },
  command: { name: "Command buttons", desc: "Allows command panes to copy shell commands to your clipboard and open a terminal. Commands are never auto-executed." },
  write: { name: "Note writing (forms)", desc: "Allows form panes and the API to create or append notes inside configured vault folders." },
};

const ROW = {
  profile: { name: "Active profile", desc: "Profiles live in the plugin folder under profiles/<id>/profile.json and hot-reload on edit." },
  terminal: { name: "Preferred terminal", desc: "Where command buttons open a terminal, stored per device. Auto reveals an integrated terminal plugin first, then falls back to the system terminal. Commands are only copied, never auto-executed." },
  export: { name: "Export bundle", desc: "Writes a shareable JSON bundle (profile.json + widgets.js if present) into the plugin folder under exports/." },
  duplicate: { name: "Duplicate active profile", desc: "Copies the active profile (profile.json + widgets.js) under a new id, the easiest way to start your own from a bundled one. The copy starts with zero trust." },
  import: { name: "Import bundle", desc: "Paste a bundle JSON exported from another vault, then import. The profile is validated first and starts with zero trust; a bundled widgets.js is stored for sharing but never executed by this version." },
  importUrl: { name: "Import from URL", desc: "Fetches a profile bundle JSON from an https:// URL (e.g. a raw GitHub link in sphragis-oss/pinax-profiles) and imports it. The imported profile starts with zero trust." },
  panes: { name: "Pane editor", desc: "Reorder, edit, add or remove panes of the active profile." },
};

export class PinaxSettingTab extends PluginSettingTab {
  private host: PinaxPluginLike;
  private editTabId: string | null = null;

  constructor(app: App, plugin: PinaxPluginLike) {
    super(app, plugin);
    this.host = plugin;
  }

  // declarative path (Obsidian 1.13+): rendered from definitions, indexed for settings search
  getSettingDefinitions(): SettingDefinitionItem[] {
    const activeId = this.host.prefs.activeProfile || "(no profile)";
    return [
      { name: ROW.profile.name, desc: ROW.profile.desc, render: (s: Setting) => this.buildActiveProfile(s) },
      { name: ROW.terminal.name, desc: ROW.terminal.desc, visible: () => Platform.isDesktopApp, render: (s: Setting) => this.buildTerminal(s) },
      { type: "group", heading: `Trusted capabilities · ${activeId}`, items: [
        { name: "", desc: TRUST_INTRO, searchable: false },
        ...GATES.map((gate) => ({ name: GATE_META[gate].name, desc: GATE_META[gate].desc, render: (s: Setting) => this.buildTrustGate(s, gate) })),
      ] },
      { type: "group", heading: `Panes · ${activeId}`, items: [
        // group is a SettingGroup; structural type because listEl is 1.11+ and this path only runs on 1.13+
        { name: ROW.panes.name, desc: ROW.panes.desc, render: (s: Setting, group: { listEl: HTMLElement }) => { s.settingEl.hide(); void this.paneEditorBody(group.listEl); } },
      ] },
      { type: "group", heading: "Share profiles", items: [
        { name: ROW.export.name, desc: ROW.export.desc, render: (s: Setting) => this.buildExport(s) },
        { name: ROW.duplicate.name, desc: ROW.duplicate.desc, render: (s: Setting) => this.buildDuplicate(s) },
        { name: ROW.import.name, desc: ROW.import.desc, render: (s: Setting) => this.buildImport(s) },
        { name: ROW.importUrl.name, desc: ROW.importUrl.desc, render: (s: Setting) => this.buildImportUrl(s) },
      ] },
    ];
  }

  // imperative fallback for Obsidian < 1.13; not called when definitions are supported
  display(): void {
    this.redraw();
  }

  private refreshTab(): void {
    const maybe = this as { update?: () => void };
    if (typeof maybe.update === "function") maybe.update();
    else this.redraw();
  }

  private redraw(): void {
    this.containerEl.empty();
    void this.renderAsync();
  }

  private async renderAsync(): Promise<void> {
    const el = this.containerEl;
    this.buildActiveProfile(new Setting(el));
    if (Platform.isDesktopApp) this.buildTerminal(new Setting(el));

    const activeId = this.host.prefs.activeProfile;
    new Setting(el).setName(`Trusted capabilities · ${activeId || "(no profile)"}`).setHeading();
    el.createEl("p", { text: TRUST_INTRO, cls: "setting-item-description" });
    for (const gate of GATES) this.buildTrustGate(new Setting(el), gate);

    new Setting(el).setName(`Panes · ${activeId || "(no profile)"}`).setHeading();
    await this.paneEditorBody(el);

    new Setting(el).setName("Share profiles").setHeading();
    this.buildExport(new Setting(el));
    this.buildDuplicate(new Setting(el));
    this.buildImport(new Setting(el));
    this.buildImportUrl(new Setting(el));
  }

  private buildActiveProfile(setting: Setting): void {
    setting.setName(ROW.profile.name).setDesc(ROW.profile.desc).addDropdown((dd) => {
      void this.host.store.list().then((ids) => {
        for (const id of ids) dd.addOption(id, id);
        dd.setValue(this.host.prefs.activeProfile);
      });
      dd.onChange((v) => {
        void this.host.setActiveProfile(v).then(() => this.refreshTab());
      });
    });
  }

  private buildTerminal(setting: Setting): void {
    const platform = currentTerminalPlatform();
    setting.setName(ROW.terminal.name).setDesc(ROW.terminal.desc).addDropdown((dd) => {
      dd.addOption("auto", "Auto");
      dd.addOption("copy", "Copy only (no terminal)");
      for (const c of terminalChoices(platform)) {
        const missing = platform === "mac" && c.macApp !== undefined && !macAppDetected(c.macApp);
        dd.addOption(c.id, missing ? `${c.label} (not found)` : c.label);
      }
      dd.setValue((this.app.loadLocalStorage(TERMINAL_PREF_KEY) as string | null) ?? "auto");
      dd.onChange((v) => { this.app.saveLocalStorage(TERMINAL_PREF_KEY, v === "auto" ? null : v); });
    });
  }

  private buildTrustGate(setting: Setting, gate: TrustGate): void {
    setting.setName(GATE_META[gate].name).setDesc(GATE_META[gate].desc).addToggle((t) => {
      t.setValue(this.host.activeTrust()[gate]);
      t.onChange((v) => {
        const trust = this.host.ensureTrust(this.host.prefs.activeProfile);
        trust[gate] = v;
        void this.host.saveSettings().then(() => this.host.refreshViews());
      });
    });
  }

  private panesOf(profile: Profile): PaneConfig[] | null {
    if (profile.layout === "grid") return profile.panes ?? null;
    const tabs = profile.tabs ?? [];
    if (tabs.length === 0) return null;
    if (!this.editTabId || !tabs.some((t) => t.id === this.editTabId)) this.editTabId = tabs[0].id;
    return tabs.find((t) => t.id === this.editTabId)?.panes ?? null;
  }

  private async mutateProfile(mutate: (panes: PaneConfig[]) => void): Promise<void> {
    const id = this.host.prefs.activeProfile;
    const res = await this.host.store.read(id);
    if (!res.ok || !res.profile) {
      new Notice(`Pinax: cannot edit "${id}": ${res.errors.join("; ")}`);
      return;
    }
    const panes = this.panesOf(res.profile);
    if (!panes) {
      new Notice("Pinax: profile has no editable pane list");
      return;
    }
    mutate(panes);
    const check = validateProfile(res.profile);
    if (!check.ok) {
      new Notice(`Pinax: change rejected: ${check.errors.join("; ")}`);
      return;
    }
    try {
      await this.host.store.write(id, res.profile);
    } catch (err) {
      new Notice(String(err));
      return;
    }
    await this.host.reloadProfile();
    this.refreshTab();
  }

  private async paneEditorBody(el: HTMLElement): Promise<void> {
    const id = this.host.prefs.activeProfile;
    const res = id ? await this.host.store.read(id) : null;
    if (!res || !res.ok || !res.profile) {
      el.createEl("p", { text: "Active profile is missing or invalid; fix it before editing panes.", cls: "setting-item-description" });
      return;
    }
    const profile = res.profile;

    if (profile.layout === "tabs") {
      const tabs = profile.tabs ?? [];
      if (!this.editTabId || !tabs.some((t) => t.id === this.editTabId)) this.editTabId = tabs[0]?.id ?? null;
      new Setting(el).setName("Tab").addDropdown((dd) => {
        for (const t of tabs) dd.addOption(t.id, t.label);
        if (this.editTabId) dd.setValue(this.editTabId);
        dd.onChange((v) => { this.editTabId = v; this.refreshTab(); });
      });
    }

    const panes = this.panesOf(profile) ?? [];
    panes.forEach((pane, i) => {
      const setting = new Setting(el).setName(`${i + 1}. ${pane.title ?? pane.type}`).setDesc(pane.type);
      setting.addExtraButton((b) => b.setIcon("arrow-up").setTooltip("Move up").onClick(() => {
        if (i === 0) return;
        void this.mutateProfile((p) => { [p[i - 1], p[i]] = [p[i], p[i - 1]]; });
      }));
      setting.addExtraButton((b) => b.setIcon("arrow-down").setTooltip("Move down").onClick(() => {
        if (i === panes.length - 1) return;
        void this.mutateProfile((p) => { [p[i], p[i + 1]] = [p[i + 1], p[i]]; });
      }));
      setting.addExtraButton((b) => b.setIcon("pencil").setTooltip("Edit").onClick(() => {
        new PaneEditModal(this.app, pane, (updated) => {
          void this.mutateProfile((p) => { p[i] = updated; });
        }).open();
      }));
      setting.addExtraButton((b) => b.setIcon("trash").setTooltip("Remove").onClick(() => {
        void this.mutateProfile((p) => { p.splice(i, 1); });
      }));
    });

    let addType = this.host.registry.listBuiltins()[0] ?? "markdown-embed";
    new Setting(el)
      .setName("Add pane")
      .setDesc("Appends a pane with default config; edit it afterwards.")
      .addDropdown((dd) => {
        for (const t of this.host.registry.listBuiltins()) dd.addOption(t, t);
        dd.setValue(addType);
        dd.onChange((v) => { addType = v; });
      })
      .addButton((b) => b.setButtonText("Add").setCta().onClick(() => {
        const defaults = this.host.registry.get(addType)?.defaults ?? {};
        const pane: PaneConfig = { type: addType, title: addType, ...structuredClone(defaults) };
        void this.mutateProfile((p) => { p.push(pane); });
      }));
  }

  private buildExport(setting: Setting): void {
    let exportId = this.host.prefs.activeProfile;
    setting.setName(ROW.export.name).setDesc(ROW.export.desc)
      .addDropdown((dd) => {
        void this.host.store.list().then((ids) => {
          for (const id of ids) dd.addOption(id, id);
          if (!exportId) exportId = ids[0] ?? "";
          if (exportId) dd.setValue(exportId);
        });
        dd.onChange((v) => { exportId = v; });
      })
      .addButton((b) => b.setButtonText("Export").onClick(() => {
        void this.host.store.exportBundle(exportId)
          .then((path) => new Notice(`Exported to ${path}`))
          .catch((err) => new Notice(String(err)));
      }));
  }

  private buildDuplicate(setting: Setting): void {
    let dupId = "";
    setting.setName(ROW.duplicate.name).setDesc(ROW.duplicate.desc)
      .addText((t) => {
        t.setPlaceholder("new-profile-id");
        t.onChange((v) => { dupId = v.trim(); });
      })
      .addButton((b) => b.setButtonText("Duplicate").onClick(() => {
        void this.host.store.duplicate(this.host.prefs.activeProfile, dupId)
          .then(async () => {
            new Notice(`Duplicated to "${dupId}"`);
            await this.host.setActiveProfile(dupId);
            this.refreshTab();
          })
          .catch((err) => new Notice(String(err)));
      }));
  }

  private buildImport(setting: Setting): void {
    let importText = "";
    setting.setName(ROW.import.name).setDesc(ROW.import.desc);
    setting.addTextArea((t) => {
      t.setPlaceholder('{"pinaxBundle":1,"id":"...","profile":{...}}');
      t.onChange((v) => { importText = v; });
      t.inputEl.rows = 4;
    });
    setting.addButton((b) => b.setButtonText("Import").setCta().onClick(() => {
      void this.host.store.importBundle(importText)
        .then(async (id) => {
          new Notice(`Imported profile "${id}"`);
          await this.host.setActiveProfile(id);
          this.refreshTab();
        })
        .catch((err) => new Notice(String(err)));
    }));
  }

  private buildImportUrl(setting: Setting): void {
    const webTrusted = this.host.activeTrust().web;
    let importUrl = "";
    setting.setName(ROW.importUrl.name).setDesc(webTrusted
      ? ROW.importUrl.desc
      : "Disabled: turn on Web embeds for the active profile to fetch bundles from the web. Imported profiles always start with zero trust.");
    setting.addText((t) => {
      t.setPlaceholder("https://raw.githubusercontent.com/.../x.pinax-profile.json");
      t.onChange((v) => { importUrl = v.trim(); });
      t.inputEl.disabled = !webTrusted;
    });
    setting.addButton((b) => b.setButtonText("Fetch + import").setDisabled(!webTrusted).onClick(() => {
      if (!this.host.activeTrust().web) {
        new Notice("Pinax: enable Web embeds for the active profile first");
        return;
      }
      if (!importUrl.startsWith("https://")) {
        new Notice("Pinax: URL must start with https://");
        return;
      }
      void requestUrl({ url: importUrl })
        .then(async (res) => {
          const id = await this.host.store.importBundle(res.text);
          new Notice(`Imported profile "${id}"`);
          await this.host.setActiveProfile(id);
          this.refreshTab();
        })
        .catch((err) => new Notice(String(err)));
    }));
  }
}

type FieldReader = () => { value: unknown; error?: string };

// Schema-driven pane editor: scalar fields become inputs, complex ones JSON sub-fields
class PaneEditModal extends Modal {
  private pane: PaneConfig;
  private onSave: (updated: PaneConfig) => void;
  private rawMode = false;

  constructor(app: App, pane: PaneConfig, onSave: (updated: PaneConfig) => void) {
    super(app);
    this.pane = pane;
    this.onSave = onSave;
  }

  onOpen(): void {
    this.draw();
  }

  private draw(): void {
    this.contentEl.empty();
    this.titleEl.setText(`Edit pane · ${this.pane.title ?? this.pane.type}`);
    if (this.rawMode) this.drawRaw();
    else this.drawForm();
  }

  private drawRaw(): void {
    const area = this.contentEl.createEl("textarea", { cls: "px-json-editor" });
    area.value = JSON.stringify(this.pane, null, 2);
    area.rows = 16;
    const errBox = this.contentEl.createDiv({ cls: "px-form-error" });
    errBox.hide();
    new Setting(this.contentEl)
      .addButton((b) => b.setButtonText("Form editor").onClick(() => {
        try {
          const parsed = JSON.parse(area.value) as PaneConfig;
          if (parsed && typeof parsed === "object" && typeof parsed.type === "string") this.pane = parsed;
        } catch { /* keep current pane */ }
        this.rawMode = false;
        this.draw();
      }))
      .addButton((b) => b.setButtonText("Cancel").onClick(() => this.close()))
      .addButton((b) => b.setButtonText("Save").setCta().onClick(() => {
        let parsed: unknown;
        try {
          parsed = JSON.parse(area.value);
        } catch (err) {
          errBox.setText(`Not valid JSON: ${String(err)}`);
          errBox.show();
          return;
        }
        if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed) || typeof (parsed as PaneConfig).type !== "string") {
          errBox.setText('Pane must be a JSON object with a "type" field.');
          errBox.show();
          return;
        }
        this.onSave(parsed as PaneConfig);
        this.close();
      }));
  }

  private drawForm(): void {
    const def = paneDefFor(this.pane.type);
    if (!def) {
      this.rawMode = true;
      this.drawRaw();
      return;
    }
    const readers = new Map<string, FieldReader>();
    const errBox = this.contentEl.createDiv({ cls: "px-form-error" });
    errBox.hide();

    for (const [key, prop] of Object.entries(def.properties)) {
      if (key === "type") continue;
      const required = def.required?.includes(key) ?? false;
      const current = this.pane[key];
      const setting = new Setting(this.contentEl)
        .setName(required ? `${key} *` : key)
        .setDesc(prop.description ?? "");

      if (Array.isArray(prop.enum)) {
        setting.addDropdown((dd) => {
          dd.addOption("", "(default)");
          for (const opt of prop.enum ?? []) dd.addOption(opt, opt);
          dd.setValue(typeof current === "string" ? current : "");
          readers.set(key, () => ({ value: dd.getValue() === "" ? undefined : dd.getValue() }));
        });
      } else if (prop.type === "boolean") {
        setting.addDropdown((dd) => {
          dd.addOption("", "(default)");
          dd.addOption("true", "On");
          dd.addOption("false", "Off");
          dd.setValue(typeof current === "boolean" ? String(current) : "");
          readers.set(key, () => ({ value: dd.getValue() === "" ? undefined : dd.getValue() === "true" }));
        });
      } else if (prop.type === "integer" || prop.type === "number") {
        setting.addText((t) => {
          t.inputEl.type = "number";
          t.setValue(current !== undefined ? String(current) : "");
          readers.set(key, () => {
            const v = t.getValue().trim();
            if (v === "") return { value: undefined };
            const n = Number(v);
            return Number.isFinite(n) ? { value: n } : { value: undefined, error: `${key} must be a number` };
          });
        });
      } else if (prop.type === "string" || prop.$ref) {
        setting.addText((t) => {
          t.setValue(typeof current === "string" ? current : "");
          readers.set(key, () => ({ value: t.getValue().trim() === "" ? undefined : t.getValue() }));
        });
      } else {
        // objects/arrays/oneOf stay JSON, one field at a time
        const area = setting.controlEl.createEl("textarea", { cls: "px-json-editor px-json-field" });
        area.rows = 5;
        area.value = current !== undefined ? JSON.stringify(current, null, 2) : "";
        readers.set(key, () => {
          const v = area.value.trim();
          if (v === "") return { value: undefined };
          try {
            return { value: JSON.parse(v) };
          } catch (err) {
            return { value: undefined, error: `${key}: not valid JSON (${String(err)})` };
          }
        });
      }
    }

    new Setting(this.contentEl)
      .addButton((b) => b.setButtonText("Edit as JSON").onClick(() => { this.collectInto(); this.rawMode = true; this.draw(); }))
      .addButton((b) => b.setButtonText("Cancel").onClick(() => this.close()))
      .addButton((b) => b.setButtonText("Save").setCta().onClick(() => {
        const errors: string[] = [];
        const updated: PaneConfig = { type: this.pane.type };
        for (const [key, read] of readers) {
          const { value, error } = read();
          if (error) errors.push(error);
          else if (value !== undefined) updated[key] = value;
        }
        for (const req of def.required ?? []) {
          if (req !== "type" && updated[req] === undefined) errors.push(`"${req}" is required`);
        }
        if (errors.length > 0) {
          errBox.setText(errors.join(" · "));
          errBox.show();
          return;
        }
        this.onSave(updated);
        this.close();
      }));

    this.paneReaders = readers;
  }

  private paneReaders: Map<string, FieldReader> | null = null;

  private collectInto(): void {
    if (!this.paneReaders) return;
    const updated: PaneConfig = { type: this.pane.type };
    for (const [key, read] of this.paneReaders) {
      const { value } = read();
      if (value !== undefined) updated[key] = value;
    }
    this.pane = updated;
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
