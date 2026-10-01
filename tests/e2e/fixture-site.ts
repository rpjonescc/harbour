// Serves the fictional Acme Docs site (tests/fixtures/sites/acme-docs) for the E2E scans; started
// by Playwright as a webServer. The E2E product config points Acme Docs at this address.
import { fixtureSite } from "@/tests/helpers/fixture-site";
import { E2E_SITE_PORT } from "../../playwright.config";

fixtureSite("acme-docs", {}, E2E_SITE_PORT).then(
  ({ origin }) => console.log(`fixture site ready on ${origin}`),
  (error: unknown) => {
    console.error("fixture site failed to start", error);
    process.exit(1);
  },
);
