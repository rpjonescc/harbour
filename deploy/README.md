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
3. Let the service start at boot, before you log in: check `loginctl show-user $USER -p Linger`,
   and if it says `Linger=no`, run `sudo loginctl enable-linger $USER` once.
   The service runs in the background and restarts automatically (5 seconds after any exit), and
   Tailscale keeps the Serve setting across reboots.
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

Update when the Agents page is idle (no run queued or running): restarting the worker cancels a
running agent and moves its work to quarantine.

```bash
git pull && pnpm install --frozen-lockfile && pnpm build && systemctl --user restart harbour-web harbour-worker
```

## Worker and agents

`install.sh` also installs `harbour-worker.service` (runs `pnpm worker`, restarts automatically).
The worker is the only process that runs agents and touches the brain's git history: it runs
queued research and discovery jobs one at a time, autosaves your brain edits and retries unpushed
commits.

1. Run `claude setup-token` and put the result in `.env` as `HARBOUR_CLAUDE_OAUTH_TOKEN=`.
   Without it agents stay disabled.
2. `systemctl --user restart harbour-web harbour-worker` to pick it up (and again whenever you
   change the token): the worker reads the token, the web only checks whether it is set.
3. The worker must find the Claude Code CLI. systemd starts it with a minimal `PATH`:
   `~/.local/bin` (where the CLI installs by default), `/usr/bin` and `/bin`, plus the
   directory `claude` was found in when you ran `install.sh`. If you install the CLI somewhere
   else later, re-run `install.sh` or set `HARBOUR_CLAUDE_BIN` in `.env` to its absolute path.
4. The brain repo must be pushable non-interactively by the worker. Test it from a
   non-interactive shell: `git -C <brain> push --dry-run`. If it prompts, set up a credential
   helper or an SSH remote.
5. Once, after the first deploy, queue the whole first run (all research topics, then discovery
   for every product): `pnpm agents:initial-run`. It is safe to repeat; jobs already queued or
   running are not duplicated.

Edit the brain only on the Harbour PC: the worker commits and pushes but never pulls. Give the
brain a `.gitignore` for editor and OS files (`.DS_Store`, `*.swp`, `*~`,
`.obsidian/workspace*.json`).

## Google data for the visibility scan

Optional. To add PageSpeed (Core Web Vitals), follow
[Connect PageSpeed](../README.md#connect-pagespeed) in the main README, put the key in `.env` as
`HARBOUR_PAGESPEED_API_KEY=`, then `systemctl --user restart harbour-worker`. The next scan's
job events say "PageSpeed: not connected — …" until the key is set.

## Logs

`journalctl --user -u harbour-web -f`
`journalctl --user -u harbour-worker -f`

## Lost every device

Run `pnpm setup-token` on the Harbour machine and register a new passkey, then remove lost
devices under **Devices**.
