import type { TFile } from "obsidian";
import type { PinaxHost } from "./host";
import type { FolderEntry, NoteRecord, WidgetSpec } from "./types";
import { latestInFolder, listFolder, readNote, records, createNote } from "./vault";
import { runCommand } from "./terminal";

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

export function buildApi(host: PinaxHost): PinaxApi {
  return {
    apiVersion: 1,
    registerWidget: (id, spec) => host.registry.register(id, spec),
    unregisterWidget: (id) => host.registry.unregister(id),
    vault: {
      latestInFolder: (folder) => latestInFolder(host.app, folder),
      listFolder: (folder) => listFolder(host.app, folder),
      readNote: (path) => readNote(host.app, path),
      records: (folder) => records(host.app, folder),
      createNote: (folder, template, data) => {
        if (!host.activeTrust().write) {
          return Promise.reject(new Error("pinax: note writing is disabled for this profile. Enable it in Settings → Pinax."));
        }
        return createNote(host.app, folder, template, data);
      },
    },
    runCommand: (cmd) => {
      if (!host.activeTrust().command) {
        return Promise.reject(new Error("pinax: command buttons are disabled for this profile. Enable them in Settings → Pinax."));
      }
      return runCommand(host.app, cmd);
    },
  };
}
