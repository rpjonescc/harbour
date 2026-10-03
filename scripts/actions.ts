import { runActionsCli } from "@/lib/actions/cli/run";
import { runSyncPrsCli } from "@/lib/actions/cli/sync-prs";
import { ghRunner } from "@/lib/actions/pr-sync/gh";

/** `pnpm actions`: Claude's audited way to triage the Actions board (see the README). */
async function main() {
  // Imported lazily, as in the other scripts, so loading this file reads no config.
  const { getConfig } = await import("@/lib/config");
  const { getDb } = await import("@/lib/db/client");
  const { getProducts } = await import("@/lib/products/catalog");
  const [command, ...rest] = process.argv.slice(2);
  const config = getConfig();
  const deps = {
    db: getDb(),
    products: getProducts(),
    timeZone: config.HARBOUR_TIMEZONE,
    now: new Date(),
  };
  // sync-prs waits on GitHub; every other command is synchronous.
  const result =
    command === "sync-prs"
      ? await runSyncPrsCli(rest, { ...deps, locale: config.HARBOUR_LOCALE, gh: ghRunner() })
      : runActionsCli(process.argv.slice(2), deps);
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
  process.exitCode = result.code;
}

main().catch((error) => {
  // A message, not a stack trace: Harbour's own errors (config, database) say what to fix.
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
