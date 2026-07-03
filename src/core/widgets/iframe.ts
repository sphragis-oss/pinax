import type { WidgetContext, WidgetSpec } from "../types";
import { emptyEl } from "../ui";

export const iframe: WidgetSpec = {
  gate: "web",
  defaults: { url: "https://example.com", height: 360 },
  render(el: HTMLElement, ctx: WidgetContext): void {
    const url = String(ctx.pane.url ?? "");
    if (!/^https:\/\//.test(url)) {
      emptyEl(el, `iframe pane needs an https:// url (got "${url}")`);
      return;
    }
    const frame = el.createEl("iframe", { cls: "px-iframe" });
    frame.src = url;
    frame.setAttribute("sandbox", "allow-scripts allow-same-origin allow-popups allow-forms");
    const h = Number(ctx.pane.height) || 360;
    frame.style.height = `${h}px`;
  },
};
