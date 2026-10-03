import { runWorker } from "./run";

runWorker().catch((error) => {
  console.error("harbour-worker crashed", error);
  process.exit(1);
});
