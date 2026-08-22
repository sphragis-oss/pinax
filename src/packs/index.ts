import type { WidgetRegistry } from "../core/registry";
import type { Profile } from "../core/types";
import { installSrePack } from "./sre";
import { installReadingPack } from "./reading";
import { installRubricPack } from "./rubric";
import sreProfile from "../../profiles/sre/profile.json";
import readingProfile from "../../profiles/reading/profile.json";
import helmProfile from "../../profiles/helm/profile.json";
import rubricProfile from "../../profiles/rubric/profile.json";

export function installPacks(registry: WidgetRegistry): void {
  installSrePack(registry);
  installReadingPack(registry);
  installRubricPack(registry);
}

export const bundledProfiles: Record<string, Profile> = {
  sre: sreProfile as unknown as Profile,
  reading: readingProfile as unknown as Profile,
  helm: helmProfile as unknown as Profile,
  rubric: rubricProfile as unknown as Profile,
};
