import type { WidgetRegistry } from "../../core/registry";
import { shelfWidget } from "./shelf";

export function installReadingPack(registry: WidgetRegistry): void {
  registry.register("reading.shelf", shelfWidget);
}
