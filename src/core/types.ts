import type { App, Component } from "obsidian";

export type TrustGate = "web" | "command" | "write" | "code";

export interface TrustSettings {
  web: boolean;
  command: boolean;
  write: boolean;
  code: boolean;
}

export const NO_TRUST: TrustSettings = { web: false, command: false, write: false, code: false };

export interface PaneConfig {
  type: string;
  title?: string;
  width?: "half" | "full";
  frame?: boolean;
  folder?: string;
  note?: string;
  url?: string;
  label?: string;
  groupBy?: string;
  widget?: string;
  submitLabel?: string;
  warn?: { above?: number; below?: number };
  sort?: { by?: string; dir?: string };
  [key: string]: unknown;
}

export interface TabConfig {
  id: string;
  label: string;
  panes: PaneConfig[];
}

export interface Profile {
  schemaVersion?: 1;
  name: string;
  layout: "grid" | "tabs";
  panes?: PaneConfig[];
  tabs?: TabConfig[];
}

export type WidgetCleanup = () => void;

export interface WidgetContext {
  app: App;
  component: Component;
  pane: PaneConfig;
  trust: TrustSettings;
  refresh(): void;
  openNote(path: string): void;
}

export interface WidgetSpec {
  gate?: TrustGate;
  defaults?: Record<string, unknown>;
  render(el: HTMLElement, ctx: WidgetContext): void | WidgetCleanup | Promise<void | WidgetCleanup>;
}

export interface FolderEntry {
  name: string;
  path: string;
  isFolder: boolean;
  mtime: number;
  fileCount: number;
}

export interface NoteRecord {
  path: string;
  name: string;
  mtime: number;
  fields: Record<string, unknown>;
}

export interface PinaxSettings {
  activeProfile: string;
  profileTrust: Record<string, TrustSettings>;
}

export const DEFAULT_SETTINGS: PinaxSettings = {
  activeProfile: "",
  profileTrust: {},
};
