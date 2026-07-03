import type { WidgetRegistry } from "../registry";
import { folderLatest } from "./folder-latest";
import { folderList } from "./folder-list";
import { markdownEmbed } from "./markdown-embed";
import { table } from "./table";
import { form } from "./form";
import { commandButtons } from "./command-buttons";
import { iframe } from "./iframe";
import { heatmap } from "./heatmap";
import { board } from "./board";
import { stat } from "./stat";
import { makeCustomWidget } from "./custom";

export function registerBuiltins(registry: WidgetRegistry): void {
  registry.registerBuiltin("folder-latest", folderLatest);
  registry.registerBuiltin("folder-list", folderList);
  registry.registerBuiltin("markdown-embed", markdownEmbed);
  registry.registerBuiltin("table", table);
  registry.registerBuiltin("form", form);
  registry.registerBuiltin("command-buttons", commandButtons);
  registry.registerBuiltin("iframe", iframe);
  registry.registerBuiltin("heatmap", heatmap);
  registry.registerBuiltin("board", board);
  registry.registerBuiltin("stat", stat);
  registry.registerBuiltin("custom", makeCustomWidget(registry));
}
