import { Notice } from "obsidian";
import type { PinaxApi } from "./api";
import type { ProfileStore } from "./profiles";
import type { WidgetRegistry } from "./registry";

// Loads a profile's optional widgets.js, gated by the "code" trust toggle.
// The file receives the window.pinax API as `pinax` and registers widgets with it.
export class ProfileCodeLoader {
  private loadedIds: string[] = [];

  constructor(private registry: WidgetRegistry, private store: ProfileStore) {}

  unloadAll(): void {
    for (const id of this.loadedIds) {
      try { this.registry.unregister(id); } catch { /* already gone */ }
    }
    this.loadedIds = [];
  }

  async load(profileId: string, api: PinaxApi, enabled: boolean): Promise<void> {
    this.unloadAll();
    if (!profileId) return;
    let src: string | null;
    try {
      src = await this.store.readWidgets(profileId);
    } catch (err) {
      new Notice(String(err));
      return;
    }
    if (src === null || !enabled) return;

    const registered: string[] = [];
    const scopedApi: PinaxApi = {
      ...api,
      registerWidget: (id, spec) => {
        api.registerWidget(id, spec);
        registered.push(id);
      },
    };
    try {
      // eslint-disable-next-line @typescript-eslint/no-implied-eval -- opt-in local widgets.js, per-profile "code" gate off by default, see SECURITY.md
      const fn = new Function("pinax", src) as (api: PinaxApi) => void;
      fn(scopedApi);
      this.loadedIds = registered;
    } catch (err) {
      this.loadedIds = registered;
      console.error(`pinax: widgets.js for "${profileId}" failed`, err);
      new Notice(`pinax: widgets.js for "${profileId}" failed: ${String(err)}`);
    }
  }
}
