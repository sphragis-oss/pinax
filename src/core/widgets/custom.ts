import type { PaneConfig, WidgetCleanup, WidgetContext, WidgetSpec } from "../types";
import type { WidgetRegistry } from "../registry";
import { placeholderEl, errorEl } from "../ui";

// Renders any widget registered via the API; unknown ids show a placeholder, never crash
export function makeCustomWidget(registry: WidgetRegistry): WidgetSpec {
  return {
    defaults: { widget: "my.widget" },
    async render(el: HTMLElement, ctx: WidgetContext): Promise<void | WidgetCleanup> {
      const id = String(ctx.pane.widget ?? "");
      if (id.length === 0) {
        placeholderEl(el, "custom pane", 'This pane needs a "widget" id.');
        return;
      }
      const spec = registry.get(id);
      if (!spec || registry.isBuiltin(id)) {
        placeholderEl(
          el,
          `widget "${id}" not registered`,
          "Register it via window.pinax.registerWidget(id, { render }) from a plugin or script, " +
            'or ship a widgets.js next to this profile\'s profile.json and enable "Custom widget code" in Settings → Pinax. ' +
            "This pane will render once it exists.",
        );
        return;
      }
      const config = (ctx.pane.config ?? {}) as Record<string, unknown>;
      const mergedPane: PaneConfig = { ...ctx.pane, ...config };
      try {
        return await spec.render(el, { ...ctx, pane: mergedPane });
      } catch (err) {
        console.error(`pinax: custom widget "${id}" failed`, err);
        errorEl(el, String(err));
      }
    },
  };
}
