import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import { connectSearchConsole } from "@/lib/scan/gsc-connect/connect";

export type ConnectArgs = { clientPath: string; outPath: string; force: boolean };

/** `~/x` as the shell would expand it, then absolute (.env needs an absolute path). */
function absolute(path: string, home: string): string {
  return resolve(path.startsWith("~/") ? join(home, path.slice(2)) : path);
}

/** Reads `--client`, `--out` and `--force`; the client defaults to ~/harbour-data/gsc-client.json. */
export function parseConnectArgs(
  argv: string[],
  home: string,
  exists: (path: string) => boolean = existsSync,
): ConnectArgs {
  const { values } = parseArgs({
    args: argv,
    options: {
      client: { type: "string" },
      out: { type: "string" },
      force: { type: "boolean", default: false },
    },
    strict: true,
  });
  const defaultClient = join(home, "harbour-data", "gsc-client.json");
  if (values.client === undefined && !exists(defaultClient)) {
    throw new Error(
      `No OAuth client file at ${defaultClient}: pass --client <path to the downloaded ` +
        'Desktop app client JSON> (see "Connect Search Console" in README.md).',
    );
  }
  return {
    clientPath: absolute(values.client ?? defaultClient, home),
    outPath: absolute(values.out ?? join(home, "harbour-data", "gsc.json"), home),
    force: values.force,
  };
}

/** Tries xdg-open; the link is printed anyway, so a missing opener only earns a hint. */
function openBrowser(url: string): void {
  const child = spawn("xdg-open", [url], { stdio: "ignore", detached: true });
  child.on("error", () => console.log("(Could not open a browser: open the link above yourself.)"));
  child.unref();
}

/** The configured `searchConsoleProperty` values, or none (with a note) if the config won't load. */
async function configuredProperties(): Promise<string[]> {
  try {
    const { getProducts } = await import("@/lib/products/catalog");
    return getProducts().flatMap((p) => (p.searchConsoleProperty ? [p.searchConsoleProperty] : []));
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.log(`Not checking harbour.config.json properties: ${reason}`);
    return [];
  }
}

async function main() {
  const args = parseConnectArgs(process.argv.slice(2), homedir());
  await connectSearchConsole(
    { ...args, properties: await configuredProperties() },
    { fetch: (url, init) => fetch(url, init), openBrowser, log: (line) => console.log(line) },
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
