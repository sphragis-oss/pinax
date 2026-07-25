import { App, Notice, Platform, WorkspaceLeaf } from "obsidian";
import { nodeRequire, NodeChildProcess, NodeFs, NodeOs } from "./platform";
import { spawnCandidates, TerminalPlatform, TerminalSpawn } from "./terminal-apps";

// device-local preference: "auto", "copy", or a TerminalChoice id
export const TERMINAL_PREF_KEY = "px-terminal-app";

export function currentTerminalPlatform(): TerminalPlatform {
  if (Platform.isMacOS) return "mac";
  if (Platform.isWin) return "win";
  return "linux";
}

export function macAppDetected(name: string): boolean {
  if (name === "Terminal") return true;
  const fs = nodeRequire<NodeFs>("fs");
  if (!fs) return true;
  const home = nodeRequire<NodeOs>("os")?.homedir() ?? "";
  return fs.existsSync(`/Applications/${name}.app`) || (home !== "" && fs.existsSync(`${home}/Applications/${name}.app`));
}

function findTerminalLeaf(app: App): WorkspaceLeaf | null {
  let found: WorkspaceLeaf | null = null;
  app.workspace.iterateAllLeaves((leaf) => {
    if (found) return;
    const view = leaf.view as { getViewType?: () => string } | undefined;
    const vt = view?.getViewType?.() ?? "";
    if (vt.toLowerCase().includes("terminal")) found = leaf;
  });
  return found;
}

// Copies the command and opens/reveals a terminal. NEVER executes the command.
export async function runCommand(app: App, cmd: string): Promise<void> {
  if (typeof cmd !== "string" || cmd.trim().length === 0) {
    throw new Error("pinax: runCommand needs a non-empty command string");
  }
  try {
    await navigator.clipboard.writeText(cmd);
    new Notice(`Copied: ${cmd}`);
  } catch {
    new Notice(`Run: ${cmd}`);
  }

  if (!Platform.isDesktopApp) {
    new Notice("Command copied. Terminals are desktop-only.");
    return;
  }

  const pref = (app.loadLocalStorage(TERMINAL_PREF_KEY) as string | null) ?? "auto";
  if (pref === "copy") return;

  if (pref === "auto") {
    const existing = findTerminalLeaf(app);
    if (existing) {
      await app.workspace.revealLeaf(existing);
      return;
    }
    const commands = (app as unknown as { commands: { executeCommandById: (id: string) => boolean } }).commands;
    const opened =
      commands.executeCommandById("terminal:open-terminal.integrated.root") ||
      commands.executeCommandById("terminal:open-terminal.external.root");
    if (opened) return;
  }

  const cp = nodeRequire<NodeChildProcess>("child_process");
  if (cp) {
    trySpawn(cp, spawnCandidates(currentTerminalPlatform(), pref), 0);
    return;
  }
  new Notice("No terminal available; the command is on your clipboard.");
}

// tries each launcher in order, moving on when spawn fails
function trySpawn(cp: NodeChildProcess, list: TerminalSpawn[], i: number): void {
  if (i >= list.length) {
    new Notice("Could not open a terminal; the command is on your clipboard.");
    return;
  }
  try {
    const child = cp.spawn(list[i].cmd, list[i].args, { stdio: "ignore" });
    child.on("error", () => trySpawn(cp, list, i + 1));
  } catch {
    trySpawn(cp, list, i + 1);
  }
}
