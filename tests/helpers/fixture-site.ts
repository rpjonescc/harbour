import { readdir, readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { type Handler, site } from "./http-site";

const SITES_DIR = join(import.meta.dirname, "..", "fixtures", "sites");

const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".xml": "application/xml",
  ".txt": "text/plain",
};

/** "index.html" → "/", "guides/faq.html" → "/guides/faq", "robots.txt" → "/robots.txt". */
function routeOf(file: string): string {
  const path = `/${file.split("\\").join("/")}`;
  if (!path.endsWith(".html")) return path;
  const page = path.slice(0, -".html".length);
  return page.endsWith("/index") ? page.slice(0, -"index".length) : page;
}

/**
 * Serves a recorded site from tests/fixtures/sites/<name> on 127.0.0.1, with `{{origin}}` in
 * files replaced by the server's origin; `extra` routes are added or override files.
 */
export async function fixtureSite(name: string, extra: Record<string, Handler> = {}) {
  const dir = join(SITES_DIR, name);
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  let origin = "";
  const routes: Record<string, Handler> = {};
  for (const entry of entries.filter((e) => e.isFile())) {
    const file = join(entry.parentPath, entry.name).slice(dir.length + 1);
    const content = await readFile(join(dir, file), "utf8");
    const type = CONTENT_TYPES[extname(file)] ?? "application/octet-stream";
    routes[routeOf(file)] = (_req, res) =>
      res.writeHead(200, { "content-type": type }).end(content.replaceAll("{{origin}}", origin));
  }
  const served = await site({ ...routes, ...extra });
  origin = served.origin;
  return served;
}
