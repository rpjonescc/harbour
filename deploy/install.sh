#!/usr/bin/env bash
# Installs Harbour as a systemd user service and exposes it on the tailnet via Tailscale Serve.
# Run from the repo root on the Harbour PC: ./deploy/install.sh
# Harbour gets its own HTTPS port (HARBOUR_HTTPS_PORT, default 8444) and never replaces an
# existing Serve configuration on that port.
set -euo pipefail

for c in node pnpm tailscale; do command -v "$c" >/dev/null || { echo "Missing $c" >&2; exit 1; }; done

REPO="$(cd "$(dirname "$0")/.." && pwd)"
NODE_BIN="$(dirname "$(command -v node)")"
UNIT_DIR="$HOME/.config/systemd/user"
HTTPS_PORT="${HARBOUR_HTTPS_PORT:-8444}"
UPSTREAM="http://127.0.0.1:3400"
MAGIC_DNS="$(tailscale status --json | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).Self.DNSName.replace(/\.$/,"")))')"

if [[ ! -f "$REPO/.env" ]]; then
  echo "Missing $REPO/.env — copy .env.example and fill it in first." >&2
  exit 1
fi
chmod 600 "$REPO/.env"

# URL.origin drops the default port, so the config must not carry :443.
if [[ "$HTTPS_PORT" == "443" ]]; then ORIGIN_HOST="$MAGIC_DNS"; else ORIGIN_HOST="$MAGIC_DNS:$HTTPS_PORT"; fi
EXPECTED_ORIGIN="HARBOUR_ORIGIN=https://$ORIGIN_HOST"
EXPECTED_RP_ID="HARBOUR_RP_ID=$MAGIC_DNS"
echo "Expected in .env:"
echo "  $EXPECTED_ORIGIN"
echo "  $EXPECTED_RP_ID"
grep -qxF "$EXPECTED_ORIGIN" "$REPO/.env" || { echo "HARBOUR_ORIGIN does not match." >&2; exit 1; }
grep -qxF "$EXPECTED_RP_ID" "$REPO/.env" || { echo "HARBOUR_RP_ID does not match." >&2; exit 1; }
if grep -q "^HARBOUR_DEV_IDENTITY=" "$REPO/.env"; then
  echo "Remove HARBOUR_DEV_IDENTITY from .env before installing." >&2
  exit 1
fi

# Refuse to touch a Serve port that something else already uses.
STATUS_JSON="$(tailscale serve status --json)" || { echo "Couldn't read \`tailscale serve status --json\`." >&2; exit 1; }
PORT_STATE_RC=0
PORT_STATE="$(printf '%s' "$STATUS_JSON" | node "$REPO/deploy/serve-port-state.mjs" "$HTTPS_PORT" "$UPSTREAM")" || PORT_STATE_RC=$?
case "$PORT_STATE_RC" in
  0) ;;
  1)
    echo "Tailscale Serve port $HTTPS_PORT is already in use; refusing to replace it:" >&2
    echo "  $PORT_STATE" >&2
    echo "Pick another port with HARBOUR_HTTPS_PORT=<port> (and update HARBOUR_ORIGIN)." >&2
    exit 1
    ;;
  *)
    echo "Couldn't read \`tailscale serve status --json\`; not touching Serve." >&2
    exit 1
    ;;
esac

(cd "$REPO" && pnpm install --frozen-lockfile && pnpm build)

mkdir -p "$UNIT_DIR"
sed -e "s|__REPO__|$REPO|g" -e "s|__NODE_BIN__|$NODE_BIN|g" \
  "$REPO/deploy/harbour-web.service.template" > "$UNIT_DIR/harbour-web.service"
sed -e "s|__REPO__|$REPO|g" -e "s|__NODE_BIN__|$NODE_BIN|g" \
  "$REPO/deploy/harbour-worker.service.template" > "$UNIT_DIR/harbour-worker.service"
systemctl --user daemon-reload
systemctl --user enable --now harbour-web.service harbour-worker.service
# enable --now does nothing for a running unit; restart so a re-run serves the new build.
systemctl --user restart harbour-web.service harbour-worker.service

if [[ "$PORT_STATE" == "ours" ]]; then
  echo "Tailscale Serve already proxies port $HTTPS_PORT to Harbour; leaving it as is."
else
  tailscale serve --bg --https="$HTTPS_PORT" "$UPSTREAM"
fi

echo
echo "Harbour is running at https://$MAGIC_DNS:$HTTPS_PORT"
if [[ "$(loginctl show-user "$USER" -p Linger --value 2>/dev/null)" == "yes" ]]; then
  echo "Harbour will start automatically at boot (user lingering is enabled)."
else
  echo "To start Harbour at boot without logging in, run once:  sudo loginctl enable-linger $USER"
fi
echo "Register your first passkey:  pnpm setup-token"
grep -q "^HARBOUR_CLAUDE_OAUTH_TOKEN=." "$REPO/.env" || echo "Agents are disabled until you add HARBOUR_CLAUDE_OAUTH_TOKEN to .env (run: claude setup-token), then: systemctl --user restart harbour-worker"
