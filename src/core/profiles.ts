import type { Plugin } from "obsidian";
import { normalizePath } from "obsidian";
import type { Profile } from "./types";
import { validateProfile, ValidationResult } from "./validate";

const PROFILE_ID_RE = /^[a-z0-9][a-z0-9-]*$/;
const WATCH_INTERVAL_MS = 1200;

export interface ProfileBundle {
  pinaxBundle: 1;
  id: string;
  profile: Profile;
  widgets?: string;
}

export class ProfileStore {
  constructor(private plugin: Plugin) {}

  private get adapter() {
    return this.plugin.app.vault.adapter;
  }

  baseDir(): string {
    return normalizePath(`${this.plugin.manifest.dir}/profiles`);
  }

  profilePath(id: string): string {
    return normalizePath(`${this.baseDir()}/${id}/profile.json`);
  }

  widgetsPath(id: string): string {
    return normalizePath(`${this.baseDir()}/${id}/widgets.js`);
  }

  async readWidgets(id: string): Promise<string | null> {
    this.assertId(id);
    const p = this.widgetsPath(id);
    if (!(await this.adapter.exists(p))) return null;
    try {
      return await this.adapter.read(p);
    } catch (err) {
      throw new Error(`pinax: could not read ${p}: ${String(err)}`, { cause: err });
    }
  }

  private assertId(id: string): void {
    if (!PROFILE_ID_RE.test(id)) {
      throw new Error(`pinax: invalid profile id "${id}" (lowercase letters, digits, dashes)`);
    }
  }

  async ensureDefaults(defaults: Record<string, Profile>): Promise<void> {
    if (!(await this.adapter.exists(this.baseDir()))) {
      await this.adapter.mkdir(this.baseDir());
    }
    for (const [id, profile] of Object.entries(defaults)) {
      this.assertId(id);
      const p = this.profilePath(id);
      if (await this.adapter.exists(p)) continue;
      await this.adapter.mkdir(normalizePath(`${this.baseDir()}/${id}`));
      await this.adapter.write(p, JSON.stringify(profile, null, 2) + "\n");
    }
  }

  async list(): Promise<string[]> {
    if (!(await this.adapter.exists(this.baseDir()))) return [];
    const listing = await this.adapter.list(this.baseDir());
    const ids: string[] = [];
    for (const folder of listing.folders) {
      const id = folder.split("/").pop() ?? "";
      if (PROFILE_ID_RE.test(id) && (await this.adapter.exists(this.profilePath(id)))) {
        ids.push(id);
      }
    }
    return ids.sort();
  }

  async read(id: string): Promise<ValidationResult> {
    this.assertId(id);
    const p = this.profilePath(id);
    if (!(await this.adapter.exists(p))) {
      return { ok: false, errors: [`profile "${id}" not found at ${p}`], profile: null };
    }
    let text: string;
    try {
      text = await this.adapter.read(p);
    } catch (err) {
      return { ok: false, errors: [`could not read ${p}: ${String(err)}`], profile: null };
    }
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch (err) {
      return { ok: false, errors: [`${p} is not valid JSON: ${String(err)}`], profile: null };
    }
    return validateProfile(data);
  }

  async write(id: string, profile: Profile): Promise<void> {
    this.assertId(id);
    const res = validateProfile(profile);
    if (!res.ok) throw new Error(`pinax: refusing to write invalid profile: ${res.errors.join("; ")}`);
    const dir = normalizePath(`${this.baseDir()}/${id}`);
    if (!(await this.adapter.exists(dir))) await this.adapter.mkdir(dir);
    await this.adapter.write(this.profilePath(id), JSON.stringify(profile, null, 2) + "\n");
  }

  // Hot-reload: poll mtimes of profile.json + widgets.js so edits re-render without a rebuild
  watch(id: string, onChange: () => void): () => void {
    const paths = [this.profilePath(id), this.widgetsPath(id)];
    const last = new Map<string, number>();
    let primed = false;
    const statAll = async (): Promise<Map<string, number>> => {
      const m = new Map<string, number>();
      for (const p of paths) {
        const st = await this.adapter.stat(p).catch(() => null);
        m.set(p, st?.mtime ?? -1);
      }
      return m;
    };
    void statAll().then((m) => {
      for (const [k, v] of m) last.set(k, v);
      primed = true;
    });
    const timer = window.setInterval(() => {
      void statAll().then((m) => {
        if (!primed) return;
        let changed = false;
        for (const [k, v] of m) {
          if (last.get(k) !== v) { last.set(k, v); changed = true; }
        }
        if (changed) onChange();
      }).catch(() => { /* transient stat failure, keep polling */ });
    }, WATCH_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }

  async duplicate(srcId: string, newId: string): Promise<void> {
    this.assertId(srcId);
    this.assertId(newId);
    if (await this.adapter.exists(this.profilePath(newId))) {
      throw new Error(`pinax: profile "${newId}" already exists`);
    }
    const res = await this.read(srcId);
    if (!res.ok || !res.profile) {
      throw new Error(`pinax: cannot duplicate "${srcId}": ${res.errors.join("; ")}`);
    }
    await this.write(newId, res.profile);
    const widgets = await this.readWidgets(srcId);
    if (widgets !== null) {
      await this.adapter.write(this.widgetsPath(newId), widgets);
    }
  }

  async exportBundle(id: string): Promise<string> {
    const res = await this.read(id);
    if (!res.ok || !res.profile) {
      throw new Error(`pinax: cannot export "${id}": ${res.errors.join("; ")}`);
    }
    const bundle: ProfileBundle = { pinaxBundle: 1, id, profile: res.profile };
    const widgets = await this.readWidgets(id);
    if (widgets !== null) bundle.widgets = widgets;
    const dir = normalizePath(`${this.plugin.manifest.dir}/exports`);
    if (!(await this.adapter.exists(dir))) await this.adapter.mkdir(dir);
    const out = normalizePath(`${dir}/${id}.pinax-profile.json`);
    await this.adapter.write(out, JSON.stringify(bundle, null, 2) + "\n");
    return out;
  }

  async importBundle(text: string): Promise<string> {
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch (err) {
      throw new Error(`pinax: bundle is not valid JSON: ${String(err)}`, { cause: err });
    }
    const b = data as Partial<ProfileBundle>;
    if (b.pinaxBundle !== 1 || typeof b.id !== "string" || !b.profile) {
      throw new Error('pinax: not a profile bundle (expected {"pinaxBundle":1,"id":...,"profile":...})');
    }
    this.assertId(b.id);
    const res = validateProfile(b.profile);
    if (!res.ok || !res.profile) {
      throw new Error(`pinax: bundle profile invalid: ${res.errors.join("; ")}`);
    }
    if (b.widgets !== undefined && typeof b.widgets !== "string") {
      throw new Error("pinax: bundle widgets must be a string of JavaScript");
    }
    await this.write(b.id, res.profile);
    if (typeof b.widgets === "string") {
      await this.adapter.write(this.widgetsPath(b.id), b.widgets);
    }
    return b.id;
  }
}
