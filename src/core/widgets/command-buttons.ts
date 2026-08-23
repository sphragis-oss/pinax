import { setIcon } from "obsidian";
import type { WidgetContext, WidgetSpec } from "../types";
import { runCommand } from "../terminal";
import { emptyEl } from "../ui";

interface ButtonConfig {
  label: string;
  command: string;
  icon?: string;
  terminal?: boolean;
  color?: string;
}

const BUTTON_COLORS = new Set(["accent", "success", "warning", "danger"]);

function isButton(b: unknown): b is ButtonConfig {
  const o = b as Record<string, unknown> | null;
  return !!o && typeof o.label === "string" && typeof o.command === "string";
}

export const commandButtons: WidgetSpec = {
  gate: "command",
  defaults: { buttons: [{ label: "Example", command: "echo hello" }] },
  async render(el: HTMLElement, ctx: WidgetContext): Promise<void> {
    let buttons = (Array.isArray(ctx.pane.buttons) ? ctx.pane.buttons : []) as ButtonConfig[];
    const file = typeof ctx.pane.buttonsFile === "string" ? ctx.pane.buttonsFile : null;
    if (file) {
      try {
        const raw: unknown = JSON.parse(await ctx.app.vault.adapter.read(file));
        const rows = (Array.isArray(raw) ? raw : []).filter(isButton);
        if (rows.length > 0) buttons = rows;
      } catch { /* file missing or malformed: keep the static fallback */ }
    }
    if (buttons.length === 0) {
      emptyEl(el, "command-buttons pane needs buttons[]");
      return;
    }
    const row = el.createDiv({ cls: "cc-skill-row" });
    for (const b of buttons) {
      const tint = b.color && BUTTON_COLORS.has(b.color) ? ` cc-skill-c-${b.color}` : "";
      const btn = row.createEl("button", { cls: "cc-skill-btn" + (b.terminal ? " cc-skill-run" : "") + tint });
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
