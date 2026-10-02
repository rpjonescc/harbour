// A stand-in for Screenpipe's local API on a fixed loopback port, started by Playwright as a
// webServer. It serves the synthetic snippets in content-fixtures.ts, never anyone's real screen.
import { startFakeScreenpipe } from "@/tests/helpers/fake-screenpipe";
import { E2E_SCREENPIPE_KEY, E2E_SCREENPIPE_PORT } from "../../playwright.config";
import { E2E_SNIPPETS } from "./content-fixtures";

startFakeScreenpipe({
  port: E2E_SCREENPIPE_PORT,
  key: E2E_SCREENPIPE_KEY,
  snippets: E2E_SNIPPETS,
}).then(
  ({ url }) => console.log(`fake screenpipe ready on ${url}`),
  (error: unknown) => {
    console.error("fake screenpipe failed to start", error);
    process.exit(1);
  },
);
