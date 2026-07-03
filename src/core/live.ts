import type { App } from "obsidian";
import type { PaneConfig, Profile } from "./types";
import { expandVars } from "./template";

interface Scope {
  prefixes: string[];
  notes: string[];
  any: boolean;
}

function collect(panes: PaneConfig[], app: App, scope: Scope): void {
  for (const pane of panes) {
    // custom widgets read arbitrary notes, so match everything
    if (pane.type === "custom") scope.any = true;
    const src = pane.source as { folder?: unknown; tags?: unknown } | undefined;
    if (src && typeof src === "object") {
      // tags can be added to any note in the vault
      if (Array.isArray(src.tags) && src.tags.length > 0) scope.any = true;
      if (typeof src.folder === "string") scope.prefixes.push(expandVars(src.folder, app));
    }
    if (typeof pane.folder === "string") scope.prefixes.push(expandVars(pane.folder, app));
    if (typeof pane.note === "string") scope.notes.push(expandVars(pane.note, app));
  }
}

// True when a change to `path` can affect what the profile displays
export function buildMatcher(profile: Profile, app: App): (path: string) => boolean {
  const scope: Scope = { prefixes: [], notes: [], any: false };
  if (profile.layout === "tabs") {
    for (const tab of profile.tabs ?? []) collect(tab.panes, app, scope);
  } else {
    collect(profile.panes ?? [], app, scope);
  }
  const prefixes = scope.prefixes.map((p) => p.replace(/\/+$/, ""));
  const notes = new Set(scope.notes);
  if (scope.any) return () => true;
  return (path: string) =>
    notes.has(path) || prefixes.some((p) => path === p || path.startsWith(p + "/"));
}
