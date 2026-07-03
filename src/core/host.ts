import type { App } from "obsidian";
import type { WidgetRegistry } from "./registry";
import type { ProfileStore } from "./profiles";
import type { PinaxSettings, Profile, TrustSettings } from "./types";

export interface PinaxHost {
  app: App;
  registry: WidgetRegistry;
  store: ProfileStore;
  settings: PinaxSettings;
  profile: Profile | null;
  profileErrors: string[];
  activeTrust(): TrustSettings;
  ensureTrust(id: string): TrustSettings;
  saveSettings(): Promise<void>;
  setActiveProfile(id: string): Promise<void>;
  reloadProfile(): Promise<void>;
  refreshViews(): void;
}
