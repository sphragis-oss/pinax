import { setIcon } from "obsidian";
import type { WidgetContext, WidgetSpec } from "../types";
import { runCommand } from "../terminal";
import { emptyEl } from "../ui";

interface ButtonConfig {
  label: string;
  command: string;
  icon?: string;
  terminal?: boolean;
}

export const commandButtons: WidgetSpec = {
  gate: "command",
  defaults: { buttons: [{ label: "Example", command: "echo hello" }] },
  render(el: HTMLElement, ctx: WidgetContext): void {
    const buttons = (Array.isArray(ctx.pane.buttons) ? ctx.pane.buttons : []) as ButtonConfig[];
    if (buttons.length === 0) {
      emptyEl(el, "command-buttons pane needs buttons[]");
      return;
    }
    const row = el.createDiv({ cls: "cc-skill-row" });
    for (const b of buttons) {
      const btn = row.createEl("button", { cls: "cc-skill-btn" + (b.terminal ? " cc-skill-run" : "") });
      btn.title = `Copies "${b.command}" and opens a terminal. Never auto-runs.`;
      if (b.icon) {
        const iconEl = btn.createSpan({ cls: "cc-skill-icon" });
        setIcon(iconEl, b.icon);
      }
      if (b.terminal) btn.createSpan({ text: "▶", cls: "cc-skill-bolt" });
      btn.createSpan({ text: b.label, cls: "cc-skill-label" });
      btn.onclick = () => { void runCommand(ctx.app, b.command); };
    }
  },
};
