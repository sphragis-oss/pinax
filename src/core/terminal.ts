import { App, Notice, Platform, WorkspaceLeaf } from "obsidian";
import { nodeRequire } from "./platform";

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

  const existing = findTerminalLeaf(app);
  if (existing) {
    app.workspace.revealLeaf(existing);
    return;
  }
  const commands = (app as unknown as { commands: { executeCommandById: (id: string) => boolean } }).commands;
  const opened =
    commands.executeCommandById("terminal:open-terminal.integrated.root") ||
    commands.executeCommandById("terminal:open-terminal.external.root");
  if (opened) return;

  if (Platform.isMacOS) {
    const cp = nodeRequire<typeof import("child_process")>("child_process");
    if (cp) {
      try {
        const child = cp.spawn("open", ["-a", "Terminal"], { stdio: "ignore" });
        child.on("error", () => new Notice("Could not open Terminal.app; command is on your clipboard."));
        return;
      } catch {
        // fall through to notice
      }
    }
  }
  new Notice("No terminal available; the command is on your clipboard.");
}
