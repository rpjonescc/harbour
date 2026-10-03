import type { SettingsFacts } from "@/lib/explain/settings";
import type { SettingsView } from "./view";

/** What the Settings verdict needs from the settings view: statuses only, never a value. */
export function settingsFacts(view: SettingsView): SettingsFacts {
  const inUse = view.keys.filter((key) => key.inUse);
  return {
    demo: view.isDemoConfig,
    backup: view.backups.health,
    claudeConnected: view.keys.some((key) => key.id === "claude" && key.status === "present"),
    brokenKeyFiles: inUse.filter((key) => key.status === "file-not-found").map((key) => key.label),
    budgetReached: view.budget.state === "reached",
    optionalMissing: inUse.filter((key) => key.id !== "claude" && key.status === "missing").length,
    awaitingApproval: view.products.reduce((sum, product) => sum + product.awaitingApproval, 0),
  };
}
