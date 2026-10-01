# Deploying Harbour

Harbour runs on an always-on Linux machine as a systemd **user** service bound to `127.0.0.1:3400`.
Tailscale Serve publishes it over HTTPS to your tailnet only and adds the
`Tailscale-User-Login` header that Lock 1 checks.

Harbour gets its own Serve HTTPS port, `8444` by default (set `HARBOUR_HTTPS_PORT` in the
shell when running `install.sh` to change it; the app does not read it), so the URL is `https://<machine>.<tailnet>.ts.net:8444`. The install script
refuses to replace an existing Serve configuration on that port: if another app already
uses it, pick a different `HARBOUR_HTTPS_PORT` and update `HARBOUR_ORIGIN` to match.

Never put `pnpm dev` behind Tailscale Serve (dev mode honours `HARBOUR_DEV_IDENTITY`).

## First install

1. `cp .env.example .env` and set:
   - `HARBOUR_ALLOWED_LOGINS` — your Tailscale login (shown by `tailscale status --json` under `User`).
   - `HARBOUR_ORIGIN` / `HARBOUR_RP_ID` — the script prints the exact values for this machine
     (`HARBOUR_ORIGIN` includes the port, e.g. `https://<machine>.<tailnet>.ts.net:8444`).
   Optionally create `harbour.config.json` (copy `harbour.config.example.json`) to list your
   products (it is read at startup: after editing it run `systemctl --user restart harbour-web`), and point `HARBOUR_BRAIN_DIR` at a separate private directory.
2. `./deploy/install.sh` (or `HARBOUR_HTTPS_PORT=<port> ./deploy/install.sh` for another port)
3. `sudo loginctl enable-linger $USER` (once) so the service starts at boot.
4. `pnpm setup-token` and open the printed link on your first device to create a passkey.
   Any WebAuthn passkey provider works. With **Bitwarden**: in the browser extension, turn on
   *Settings → Notifications → Ask to save and use passkeys*, and pick Bitwarden (not the browser's
   own password manager) when the save prompt appears. Harbour requires user verification, so
   Bitwarden asks for your master password or PIN when you create the passkey and each time you
   sign in.
5. Add more devices from **Devices → Add a device** on a signed-in device. If you use Bitwarden,
   the passkey syncs to your other devices, so they can usually sign in directly without a new
   setup link. In that case one entry under Devices covers every device signed in with the
   Bitwarden passkey, and removing it signs them all out.

## Verify the locks

```bash
# Not reachable from the LAN (only loopback is bound): expect "connection refused".
curl -m 3 http://$(hostname -I | awk '{print $1}'):3400/
# Direct to loopback without identity: expect 403.
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3400/
```
From another tailnet device, `https://<machine>.<tailnet>.ts.net:8444` should show the passkey sign-in.

## Updating

```bash
git pull && pnpm install --frozen-lockfile && pnpm build && systemctl --user restart harbour-web
```

## Logs

`journalctl --user -u harbour-web -f`

## Lost every device

Run `pnpm setup-token` on the Harbour machine and register a new passkey, then remove lost
devices under **Devices**.
