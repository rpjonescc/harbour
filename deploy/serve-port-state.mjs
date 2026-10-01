// Reads `tailscale serve status --json` on stdin and reports who owns an HTTPS port.
// Usage: tailscale serve status --json | node deploy/serve-port-state.mjs <port> <expected-proxy>
// Prints "free", "ours", or "taken: <what is configured>".
// Exit 0 for free/ours, 1 when taken (including any Funnel exposure), 2 on usage or parse errors.
const [port, expectedProxy] = process.argv.slice(2);
if (!port || !expectedProxy) {
  console.error("usage: serve-port-state.mjs <port> <expected-proxy>");
  process.exit(2);
}

let raw = "";
process.stdin.on("data", (chunk) => (raw += chunk));
process.stdin.on("end", () => {
  let status;
  try {
    status = raw.trim() === "" ? {} : JSON.parse(raw);
    if (status === null || typeof status !== "object" || Array.isArray(status)) {
      throw new Error("expected a JSON object");
    }
  } catch (error) {
    console.error(`Could not parse tailscale serve status JSON: ${error.message}`);
    process.exit(2);
  }

  // The top-level config plus every foreground session share the same TCP/Web shape.
  const configs = [status, ...Object.values(status.Foreground ?? {})];
  const tcp = configs.flatMap((config) => (config?.TCP?.[port] ? [config.TCP[port]] : []));
  const web = configs.flatMap((config) =>
    Object.entries(config?.Web ?? {}).filter(([hostPort]) => hostPort.endsWith(`:${port}`)),
  );
  const funnel = Object.entries(status.AllowFunnel ?? {}).filter(
    ([hostPort, enabled]) => hostPort.endsWith(`:${port}`) && enabled,
  );

  if (tcp.length === 0 && web.length === 0 && funnel.length === 0) {
    console.log("free");
    return;
  }
  const handlers = web.flatMap(([, site]) => Object.values(site.Handlers ?? {}));
  const ours =
    funnel.length === 0 &&
    tcp.length > 0 &&
    tcp.every((entry) => entry.HTTPS === true && !entry.TCPForward) &&
    handlers.length > 0 &&
    handlers.every((handler) => handler.Proxy === expectedProxy);
  if (ours) {
    console.log("ours");
    return;
  }
  console.log(
    `taken: ${JSON.stringify({ TCP: tcp, Web: Object.fromEntries(web), Funnel: Object.fromEntries(funnel) })}`,
  );
  process.exit(1);
});
