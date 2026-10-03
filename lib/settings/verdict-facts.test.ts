import { EXAMPLE_SETTINGS } from "@/components/design/ops-example-data";
import { settingsFacts } from "./verdict-facts";

describe("settingsFacts", () => {
  it("reads statuses from the view: Claude, broken key files, missing options and approvals", () => {
    const view = {
      ...EXAMPLE_SETTINGS,
      isDemoConfig: false,
      keys: [
        { id: "claude", label: "Claude token", status: "missing", inUse: true, paid: false },
        {
          id: "search-console",
          label: "Search Console",
          status: "file-not-found",
          inUse: true,
          paid: false,
        },
        { id: "pagespeed", label: "PageSpeed", status: "missing", inUse: true, paid: false },
        { id: "openai", label: "OpenAI", status: "missing", inUse: false, paid: true },
      ],
      products: EXAMPLE_SETTINGS.products.map((p) => ({ ...p, awaitingApproval: 2 })),
    } satisfies typeof EXAMPLE_SETTINGS;
    const facts = settingsFacts(view);
    expect(facts.claudeConnected).toBe(false);
    expect(facts.brokenKeyFiles).toEqual(["Search Console"]);
    // Only sources in use count; a source Harbour doesn't collect yet is not "missing".
    expect(facts.optionalMissing).toBe(1);
    expect(facts.awaitingApproval).toBe(2 * EXAMPLE_SETTINGS.products.length);
    expect(facts.backup).toBe(EXAMPLE_SETTINGS.backups.health);
  });
});
