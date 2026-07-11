// window.pinax (apiVersion 1) types for companion plugins; copy into your plugin, needs the obsidian typings
import type { App, Component, TFile } from "obsidian";

export type TrustGate = "web" | "command" | "write";

export interface TrustSettings {
  web: boolean;
  command: boolean;
  write: boolean;
}

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

export interface PinaxApi {
  apiVersion: 1;
  registerWidget(id: string, spec: WidgetSpec): void;
  unregisterWidget(id: string): void;
  vault: {
    latestInFolder(folder: string): TFile | null;
    listFolder(folder: string): FolderEntry[];
    readNote(path: string): Promise<string>;
    records(folder: string): Promise<NoteRecord[]>;
    createNote(folder: string, template: string | undefined, data: Record<string, unknown>): Promise<TFile>;
  };
  runCommand(cmd: string): Promise<void>;
}

declare global {
  interface Window { pinax?: PinaxApi; }
}
