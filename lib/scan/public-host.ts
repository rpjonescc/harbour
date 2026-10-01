import type { LookupAddress } from "node:dns";
import { lookup } from "node:dns/promises";
import { BlockList, isIP, isIPv6, type LookupFunction } from "node:net";
import { FetchError } from "./fetch-error";

export type HostPolicy = { allowLoopback: boolean };

// Addresses a scan must never reach: private, link-local (cloud metadata), CGNAT (tailnets),
// multicast, benchmarking (198.18/15), IETF (192.0.0/24) and reserved ranges, plus the IPv6
// translation prefixes (NAT64, 6to4) that can wrap any of those. Node checks IPv4-mapped IPv6 addresses against the IPv4 rules.
const PRIVATE = new BlockList();
for (const [network, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["198.18.0.0", 15],
  ["192.168.0.0", 16],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) {
  PRIVATE.addSubnet(network, prefix, "ipv4");
}
for (const [network, prefix] of [
  ["::", 128],
  ["64:ff9b::", 96],
  ["2002::", 16],
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

/** Every address a hostname resolves to (tests inject a fake resolver). */
export type ResolveHost = (hostname: string) => Promise<LookupAddress[]>;

export const resolveWithDns: ResolveHost = (hostname) =>
  lookup(hostname, { all: true, verbatim: true });

/** Whether `hostname` is an IP literal (bracketed IPv6 included) outside the public internet. */
export function isNonPublicLiteral(hostname: string, policy: HostPolicy): boolean {
  const bare = hostname.replace(/^\[(.*)\]$/, "$1");
  return isIP(bare) !== 0 && !isPublicAddress(bare, policy);
}

/**
 * A `lookup` for http(s).request that refuses a name unless every address it resolves to is
 * public. Checking at connect time, on the addresses the socket then uses, leaves no window
 * for DNS rebinding. Node skips `lookup` for IP literals: check those with isNonPublicLiteral.
 */
export function publicLookup(resolve: ResolveHost, policy: HostPolicy): LookupFunction {
  return (hostname, options, callback) => {
    resolve(hostname).then(
      (addresses) => {
        if (addresses.length === 0 || !addresses.every((a) => isPublicAddress(a.address, policy))) {
          callback(new FetchError("network", `Refused non-public host ${hostname}`), "");
          return;
        }
        const family = options.family === 4 || options.family === 6 ? options.family : null;
        const usable = family ? addresses.filter((a) => a.family === family) : addresses;
        const [first] = usable;
        if (!first) {
          callback(new FetchError("network", `No IPv${family} address for ${hostname}`), "");
        } else if (options.all) {
          callback(null, usable);
        } else {
          callback(null, first.address, first.family);
        }
      },
      (error: unknown) => {
        const cause = error instanceof Error ? error : new Error(String(error));
        callback(new FetchError("network", `Could not resolve ${hostname}`, { cause }), "");
      },
    );
  };
}
