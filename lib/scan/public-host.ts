import { lookup } from "node:dns/promises";
import { BlockList, isIPv6 } from "node:net";

export type HostPolicy = { allowLoopback: boolean };

// Addresses a scan must never reach: private, link-local (cloud metadata), CGNAT (tailnets),
// multicast and reserved ranges. Node checks IPv4-mapped IPv6 addresses against the IPv4 rules.
const PRIVATE = new BlockList();
for (const [network, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.168.0.0", 16],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) {
  PRIVATE.addSubnet(network, prefix, "ipv4");
}
for (const [network, prefix] of [
  ["::", 128],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
] as const) {
  PRIVATE.addSubnet(network, prefix, "ipv6");
}

const LOOPBACK = new BlockList();
LOOPBACK.addSubnet("127.0.0.0", 8, "ipv4");
LOOPBACK.addAddress("::1", "ipv6");

/** Whether an IP address is on the public internet (loopback only when the policy allows it). */
export function isPublicAddress(address: string, policy: HostPolicy): boolean {
  const type = isIPv6(address) ? "ipv6" : "ipv4";
  if (PRIVATE.check(address, type)) return false;
  return policy.allowLoopback || !LOOPBACK.check(address, type);
}

/**
 * Resolves a URL hostname and checks every address it maps to. The later connection resolves
 * again, so this guards against misconfiguration rather than a hostile DNS server.
 */
export async function resolvePublicHost(hostname: string, policy: HostPolicy): Promise<boolean> {
  const bare = hostname.replace(/^\[(.*)\]$/, "$1");
  const addresses = await lookup(bare, { all: true, verbatim: true });
  return addresses.length > 0 && addresses.every(({ address }) => isPublicAddress(address, policy));
}
