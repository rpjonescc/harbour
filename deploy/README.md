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
# Direct to loopback (a host name other than HARBOUR_ORIGIN's): expect 403.
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3400/
```
From another tailnet device, `https://<machine>.<tailnet>.ts.net:8444` should show the passkey sign-in.

## Updating

Update when the Agents page is idle (no run queued or running): restarting the worker cancels a
running agent (its work moves to quarantine) or a running scan (it is marked failed). On start the
worker queues a catch-up scan of every product not scanned in the last 24 hours; scans run in
queue order with agent jobs, so a fresh install scans every product before later agent runs.
Restart the worker before the web so only one process applies new database migrations.

```bash
git pull && pnpm install --frozen-lockfile && pnpm build && systemctl --user restart harbour-worker harbour-web
```

## Worker and agents

`install.sh` also installs `harbour-worker.service` (runs `pnpm worker`, restarts automatically).
The worker is the only process that runs agents and touches the brain's git history: it runs
queued research, discovery and weekly analyst jobs one at a time, autosaves your brain edits and
retries unpushed commits. It queues the weekly analyst itself every Sunday at 20:00
(`HARBOUR_TIMEZONE`) unless `HARBOUR_SCHEDULED_ANALYST=off`.

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
6. The deploy that brings the Actions board: actions are created by scans, so before restarting
   the services run `pnpm scan:now` (after `pnpm build`). It applies the new migrations and
   queues a scan of every product ahead of the weekly report's catch-up run, so Today and the
   board fill in first and the report sees the actions. Then restart as usual. After that deploy
   you usually need to do nothing for the weekly analyst: on start the worker catches up and queues last Sunday's report itself when a product has a scored scan in
   the last 7 days. Check **Agents → Recent runs** for a "Weekly report" run. Only if there is
   none and the worker log (`journalctl --user -u harbour-worker`) says "weekly analyst skipped",
   fix the cause it names (the Claude token, or no recent scan), then run `pnpm analyst:now`. It
   prints the job id. Running it while the catch-up run exists would add a second, partial-week
   report for the current week.

Edit the brain only on the Harbour PC: the worker commits and pushes but never pulls. Give the
brain a `.gitignore` for editor and OS files (`.DS_Store`, `*.swp`, `*~`,
`.obsidian/workspace*.json`).

## Google data for the visibility scan

Optional. To add PageSpeed (Core Web Vitals), follow
[Connect PageSpeed](../README.md#connect-pagespeed) in the main README, put the key in `.env` as
`HARBOUR_PAGESPEED_API_KEY=`, then `systemctl --user restart harbour-worker`. The next scan's
job events say "PageSpeed: not connected — …" until the key is set.

To add Search Console, follow [Connect Search Console](../README.md#connect-search-console).
With your own Google account (needed when your Workspace organisation blocks service-account
keys), save the downloaded Desktop app OAuth client as `~/harbour-data/gsc-client.json` and run
`pnpm gsc:connect` in the app folder: it signs you in, checks which properties your account
can read and writes `~/harbour-data/gsc.json` with mode 600. Its sign-in page is served on
`127.0.0.1` on this machine, so from another computer forward the port in the printed link
first (`ssh -L <port>:127.0.0.1:<port> ...`). With a service account instead, add its email as a
**Restricted** user on each Search Console property, then on this machine:

```bash
mkdir -p ~/harbour-data
mv path/to/downloaded.json ~/harbour-data/gsc.json
chmod 600 ~/harbour-data/gsc.json
```

Either way, set `HARBOUR_GSC_CREDENTIALS` in `.env` to that file's absolute path (the output of
`echo ~/harbour-data/gsc.json`; `.env` does not expand `~`), add
`"searchConsoleProperty"` to each product in `harbour.config.json` (`"sc-domain:example.com"`
or a URL prefix like `"https://www.example.com/"`), and
`systemctl --user restart harbour-worker`. Only the worker reads the file.

## Backups

The worker backs up the database every night at 03:15 (`HARBOUR_TIMEZONE`) into
`HARBOUR_BACKUP_DIR`, by default `data/backups` — inside the gitignored `data` folder, so
backups never reach git. The newest 14 are kept, each verified and mode 600. Treat them like
`.env` (they hold session hashes and the audit log) and copy them off the machine yourself.
`pnpm backup:now` queues one now. The worker's start-up line in its log names the next backup
("next backup 2026-10-03 03:15 Europe/London", or "nightly backup off").

To restore a backup (see "Backups and restore" in the main README for details), run these from
the Harbour folder (the paths below are relative to it):

```bash
systemctl --user stop harbour-worker harbour-web
cp data/backups/harbour-YYYY-MM-DD.db data/harbour.db   # or your HARBOUR_DB_PATH
rm -f data/harbour.db-wal data/harbour.db-shm
systemctl --user start harbour-web
systemctl --user start harbour-worker
```

## Logs

`journalctl --user -u harbour-web -f`
`journalctl --user -u harbour-worker -f`

## Lost every device

Run `pnpm setup-token` on the Harbour machine and register a new passkey, then remove lost
devices under **Devices**.
