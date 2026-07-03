import type { WidgetRegistry } from "../../core/registry";
import { scanWidget } from "./scan";
import { tasksWidget } from "./tasks";
import { scheduleWidget } from "./schedule";
import { jiraWidget } from "./jira";
import { clotributorWidget } from "./clotributor";
import { releasesWidget } from "./releases";
import { projectsWidget } from "./projects";
import { heroWidget } from "./hero";
import { alertsWidget } from "./alerts";
import { servicesWidget } from "./services";
import { mcpWidget } from "./mcp";
import { usageWidget } from "./usage";
import { platformWidget } from "./platform";
import { reliabilityWidget } from "./reliability";
import { standupWidget } from "./standup";
import { reportsWidget } from "./reports";

export function installSrePack(registry: WidgetRegistry): void {
  registry.register("sre.scan", scanWidget);
  registry.register("sre.tasks", tasksWidget);
  registry.register("sre.schedule", scheduleWidget);
  registry.register("sre.jira", jiraWidget);
  registry.register("sre.clotributor", clotributorWidget);
  registry.register("sre.releases", releasesWidget);
  registry.register("sre.projects", projectsWidget);
  registry.register("sre.hero", heroWidget);
  registry.register("sre.alerts", alertsWidget);
  registry.register("sre.services", servicesWidget);
  registry.register("sre.mcp", mcpWidget);
  registry.register("sre.usage", usageWidget);
  registry.register("sre.platform", platformWidget);
  registry.register("sre.reliability", reliabilityWidget);
  registry.register("sre.standup", standupWidget);
  registry.register("sre.reports", reportsWidget);
}
