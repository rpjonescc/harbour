import { runActionsCli } from "@/lib/actions/cli/run";

/** `pnpm actions`: Claude's audited way to triage the Actions board (see the README). */
async function main() {
  // Imported lazily, as in the other scripts, so loading this file reads no config.
  const { getConfig } = await import("@/lib/config");
  const { getDb } = await import("@/lib/db/client");
  const { getProducts } = await import("@/lib/products/catalog");
  const result = runActionsCli(process.argv.slice(2), {
    db: getDb(),
    products: getProducts(),
    timeZone: getConfig().HARBOUR_TIMEZONE,
    now: new Date(),
  });
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
  process.exitCode = result.code;
}

main().catch((error) => {
  // A message, not a stack trace: Harbour's own errors (config, database) say what to fix.
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
