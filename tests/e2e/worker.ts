// The worker for the end-to-end tests: the production worker with the Treg collector pointed at the
// fake Treg (tests/e2e/fake-treg-server.ts). The address lives here, in test code only: there is no
// setting that sends Treg's key anywhere but treg.to.
import { createDefaultTreg } from "@/lib/scan/collectors/treg";
import { COLLECTORS } from "@/lib/scan/registry";
import { E2E_TREG_PORT } from "../../playwright.config";
import { runWorker } from "../../worker/run";

const FAKE_HOST = "127.0.0.1";
const fake = createDefaultTreg(`http://${FAKE_HOST}:${E2E_TREG_PORT}`);

runWorker({
  collectors: COLLECTORS.map((collector) => (collector.id === "treg" ? fake : collector)),
  customHeaderHosts: [FAKE_HOST],
}).catch((error) => {
  console.error("harbour-worker crashed", error);
  process.exit(1);
});
