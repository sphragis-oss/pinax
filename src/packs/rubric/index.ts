import type { WidgetRegistry } from "../../core/registry";
import { clockWidget } from "./clock";
import { brainWidget } from "./brain";
import { prsWidget } from "./prs";

export function installRubricPack(registry: WidgetRegistry): void {
  registry.register("rubric.clock", clockWidget);
  registry.register("rubric.brain", brainWidget);
  registry.register("rubric.prs", prsWidget);
}
