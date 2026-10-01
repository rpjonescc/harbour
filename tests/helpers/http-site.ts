import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { FetchError } from "@/lib/scan/fetch-error";

export type Handler = (req: IncomingMessage, res: ServerResponse) => void;

const servers: Server[] = [];

/** Closes every site started by `site()`; call from afterEach. */
export async function closeSites(): Promise<void> {
  for (const server of servers.splice(0)) {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}

/**
 * A local site on 127.0.0.1 whose routes the test defines; records every request path. Listens
 * on a free port unless given one (the E2E fixture site needs a fixed address).
 */
export async function site(routes: Record<string, Handler>, port = 0) {
  const hits: string[] = [];
  const arrivals: number[] = [];
  const server = createServer((req, res) => {
    hits.push(req.url ?? "");
    arrivals.push(performance.now());
    const handler = routes[req.url ?? ""];
    if (handler) handler(req, res);
    else res.writeHead(404).end("not found");
  });
  servers.push(server);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });
  const address = server.address() as AddressInfo;
  return { origin: `http://127.0.0.1:${address.port}`, port: address.port, hits, arrivals };
}

export const text =
  (body: string, headers: Record<string, string> = {}): Handler =>
  (_req, res) =>
    res.writeHead(200, { "content-type": "text/plain", ...headers }).end(body);

export const redirect =
  (location: string): Handler =>
  (_req, res) =>
    res.writeHead(301, { location }).end();

export const never: Handler = () => {};

/** Resolves to the FetchError the promise rejects with; fails the test on anything else. */
export async function fetchError(promise: Promise<unknown>): Promise<FetchError> {
  const error = await promise.then(
    () => null,
    (caught: unknown) => caught,
  );
  if (!(error instanceof FetchError)) throw new Error(`expected a FetchError, got ${error}`);
  return error;
}
