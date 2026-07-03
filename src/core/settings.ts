import { App, Modal, Notice, Plugin, PluginSettingTab, Setting, requestUrl } from "obsidian";
import type { PinaxHost } from "./host";
import type { PaneConfig, Profile, TrustGate } from "./types";
import { validateProfile } from "./validate";
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

export class PinaxSettingTab extends PluginSettingTab {
  private host: PinaxPluginLike;
  private editTabId: string | null = null;

  constructor(app: App, plugin: PinaxPluginLike) {
    super(app, plugin);
    this.host = plugin;
  }

  display(): void {
    this.containerEl.empty();
    void this.renderAsync();
  }

  private async renderAsync(): Promise<void> {
    const el = this.containerEl;
    const ids = await this.host.store.list();
    new Setting(el)
      .setName("Active profile")
      .setDesc("Profiles live in the plugin folder under profiles/<id>/profile.json and hot-reload on edit.")
      .addDropdown((dd) => {
        for (const id of ids) dd.addOption(id, id);
        dd.setValue(this.host.settings.activeProfile);
        dd.onChange((v) => {
          void this.host.setActiveProfile(v).then(() => this.display());
        });
      });

    const activeId = this.host.settings.activeProfile;
    new Setting(el).setName(`Trusted capabilities · ${activeId || "(no profile)"}`).setHeading();
    el.createEl("p", {
      text: "Trust is granted per profile and every toggle starts OFF. A newly imported profile never inherits trust you gave another one. Only enable capabilities for profiles you trust.",
      cls: "setting-item-description",
    });
    this.trustToggle(el, "web", "Web embeds (iframe)", "Allows iframe panes to load external https:// pages inside your vault window.");
    this.trustToggle(el, "command", "Command buttons", "Allows command panes to copy shell commands to your clipboard and open a terminal. Commands are never auto-executed.");
    this.trustToggle(el, "write", "Note writing (forms)", "Allows form panes and the API to create or append notes inside configured vault folders.");
    this.trustToggle(el, "code", "Custom widget code (widgets.js)", "DANGER: runs the JavaScript in this profile's widgets.js with full plugin access, like installing a plugin. Enable only if you wrote it or trust who did.");

    await this.renderPaneEditor(el);
    await this.renderShare(el, ids);
  }

  private trustToggle(el: HTMLElement, gate: TrustGate, name: string, desc: string): void {
    new Setting(el)
      .setName(name)
      .setDesc(desc)
      .addToggle((t) => {
        t.setValue(this.host.activeTrust()[gate]);
        t.onChange((v) => {
          const trust = this.host.ensureTrust(this.host.settings.activeProfile);
          trust[gate] = v;
          void this.host.saveSettings().then(async () => {
            // code toggle changes which widgets exist, so reload the whole profile
            if (gate === "code") await this.host.reloadProfile();
            this.host.refreshViews();
          });
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
    const id = this.host.settings.activeProfile;
    const res = await this.host.store.read(id);
    if (!res.ok || !res.profile) {
      new Notice(`pinax: cannot edit "${id}": ${res.errors.join("; ")}`);
      return;
    }
    const panes = this.panesOf(res.profile);
    if (!panes) {
      new Notice("pinax: profile has no editable pane list");
      return;
    }
    mutate(panes);
    const check = validateProfile(res.profile);
    if (!check.ok) {
      new Notice(`pinax: change rejected: ${check.errors.join("; ")}`);
      return;
    }
    try {
      await this.host.store.write(id, res.profile);
    } catch (err) {
      new Notice(String(err));
      return;
    }
    await this.host.reloadProfile();
    this.display();
  }

  private async renderPaneEditor(el: HTMLElement): Promise<void> {
    const id = this.host.settings.activeProfile;
    new Setting(el).setName(`Panes · ${id || "(no profile)"}`).setHeading();
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
        dd.onChange((v) => { this.editTabId = v; this.display(); });
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

  private async renderShare(el: HTMLElement, ids: string[]): Promise<void> {
    new Setting(el).setName("Share profiles").setHeading();

    let exportId = this.host.settings.activeProfile || ids[0] || "";
    new Setting(el)
      .setName("Export bundle")
      .setDesc("Writes a shareable JSON bundle (profile.json + widgets.js if present) into the plugin folder under exports/.")
      .addDropdown((dd) => {
        for (const id of ids) dd.addOption(id, id);
        if (exportId) dd.setValue(exportId);
        dd.onChange((v) => { exportId = v; });
      })
      .addButton((b) => b.setButtonText("Export").onClick(() => {
        void this.host.store.exportBundle(exportId)
          .then((path) => new Notice(`Exported to ${path}`))
          .catch((err) => new Notice(String(err)));
      }));

    let dupId = "";
    new Setting(el)
      .setName("Duplicate active profile")
      .setDesc("Copies the active profile (profile.json + widgets.js) under a new id, the easiest way to start your own from a bundled one. The copy starts with zero trust.")
      .addText((t) => {
        t.setPlaceholder("new-profile-id");
        t.onChange((v) => { dupId = v.trim(); });
      })
      .addButton((b) => b.setButtonText("Duplicate").onClick(() => {
        void this.host.store.duplicate(this.host.settings.activeProfile, dupId)
          .then(async () => {
            new Notice(`Duplicated to "${dupId}"`);
            await this.host.setActiveProfile(dupId);
            this.display();
          })
          .catch((err) => new Notice(String(err)));
      }));

    let importText = "";
    const importSetting = new Setting(el)
      .setName("Import bundle")
      .setDesc("Paste a bundle JSON exported from another vault, then import. The profile is validated first and starts with zero trust; bundled widgets.js stays inert until you enable Custom widget code.");
    importSetting.addTextArea((t) => {
      t.setPlaceholder('{"pinaxBundle":1,"id":"...","profile":{...}}');
      t.onChange((v) => { importText = v; });
      t.inputEl.rows = 4;
    });
    importSetting.addButton((b) => b.setButtonText("Import").setCta().onClick(() => {
      void this.host.store.importBundle(importText)
        .then(async (id) => {
          new Notice(`Imported profile "${id}"`);
          await this.host.setActiveProfile(id);
          this.display();
        })
        .catch((err) => new Notice(String(err)));
    }));

    const webTrusted = this.host.activeTrust().web;
    let importUrl = "";
    const urlSetting = new Setting(el)
      .setName("Import from URL")
      .setDesc(webTrusted
        ? "Fetches a profile bundle JSON from an https:// URL (e.g. a raw GitHub link in sphragis-oss/pinax-profiles) and imports it. The imported profile starts with zero trust."
        : "Disabled: turn on Web embeds for the active profile to fetch bundles from the web. Imported profiles always start with zero trust.");
    urlSetting.addText((t) => {
      t.setPlaceholder("https://raw.githubusercontent.com/.../x.pinax-profile.json");
      t.onChange((v) => { importUrl = v.trim(); });
      t.inputEl.disabled = !webTrusted;
    });
    urlSetting.addButton((b) => b.setButtonText("Fetch + import").setDisabled(!webTrusted).onClick(() => {
      if (!this.host.activeTrust().web) {
        new Notice("pinax: enable Web embeds for the active profile first");
        return;
      }
      if (!importUrl.startsWith("https://")) {
        new Notice("pinax: URL must start with https://");
        return;
      }
      void requestUrl({ url: importUrl })
        .then(async (res) => {
          const id = await this.host.store.importBundle(res.text);
          new Notice(`Imported profile "${id}"`);
          await this.host.setActiveProfile(id);
          this.display();
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
          dd.addOption("true", "on");
          dd.addOption("false", "off");
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
