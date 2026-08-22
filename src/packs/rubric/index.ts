import type { WidgetRegistry } from "../../core/registry";
import { clockWidget } from "./clock";
import { brainWidget } from "./brain";

export function installRubricPack(registry: WidgetRegistry): void {
  registry.register("rubric.clock", clockWidget);
  registry.register("rubric.brain", brainWidget);
}
