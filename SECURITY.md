# Security policy

## Supported versions

Only the `main` branch is supported. Fixes land on `main`; there are no maintained
release branches.

## Threat model

Harbour is a single-owner, self-hosted app reachable only over a Tailscale network.

- **Network exposure.** The web server binds `127.0.0.1` only. Tailscale Serve is the only
  path in, and it publishes Harbour solely to the owner's tailnet.
- **Lock 1 — identity.** Tailscale Serve adds the verified `Tailscale-User-Login` header;
  Harbour rejects any login not on its allowlist.
- **Lock 2 — passkey.** A WebAuthn passkey with user verification is required for every
  session. Passkeys can only be registered with a single-use, short-lived setup token.
- **Sessions** are stored hashed, bound to the Tailscale login, and expire.
- **Browser hardening.** Nonce-based CSP, strict security headers, same-origin JSON-only
  mutating routes, `SameSite=Strict` cookies.
- **Accountability.** Sign-ins, failed sign-ins, passkey changes and setup links are
  written to an audit log.

In scope: anything that lets someone on the tailnet (or the internet) read or change
Harbour data without both locks, bypasses CSRF/CSP protections, leaks secrets to the
client, or lets untrusted content (fetched pages, agent output, markdown) execute code.

## Out of scope

- Attacks that require tailnet admin rights (for example, editing ACLs or Serve
  configuration) or local root / the owner's user account on the Harbour machine.
- Compromise of the owner's passkey provider or devices.
- Running `pnpm dev` (which honours `HARBOUR_DEV_IDENTITY`) exposed to a network, contrary
  to the deployment guide.
- Denial of service from authenticated users.

## Reporting a vulnerability

Please report privately through GitHub private vulnerability reporting: open the
repository's **Security** tab and choose **Report a vulnerability**. Do not open a public
issue. Include steps to reproduce and the affected commit; you will get a response as soon
as practical.
