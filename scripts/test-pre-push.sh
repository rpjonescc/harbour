#!/bin/sh
# Integration test for the pre-push private-data scan: installs this repo's real lefthook
# config in a scratch clone with a bare remote and checks that leaking pushes are rejected.
# Usage: scripts/test-pre-push.sh   (exit 0 = all cases behaved; anything else = failure)
set -eu
# When run from inside a git hook, never touch the outer repository.
unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE GIT_PREFIX LEFTHOOK

REPO=$(cd "$(dirname "$0")/.." && pwd)
LEFTHOOK_BIN=${LEFTHOOK_BIN:-$REPO/node_modules/.bin/lefthook}
[ -x "$LEFTHOOK_BIN" ] || { echo "lefthook binary not found at $LEFTHOOK_BIN" >&2; exit 2; }
export LEFTHOOK_BIN HARBOUR_REPO="$REPO"

SCRATCH=$(mktemp -d)
[ -n "${KEEP_SCRATCH:-}" ] || trap 'rm -rf "$SCRATCH"' EXIT; echo "scratch: $SCRATCH" >&2
git init -q --bare "$SCRATCH/remote.git"
git clone -q "$SCRATCH/remote.git" "$SCRATCH/work" 2>/dev/null
cd "$SCRATCH/work"
git config user.name "Sam Sample"
git config user.email "sam@example.com"
git config commit.gpgsign false
git checkout -q -b main

cp "$REPO/lefthook.yml" .
cp -R "$REPO/.lefthook" .
# Runs the real scanner from this checkout; `check` itself is out of scope here.
cat > package.json <<'JSON'
{
  "name": "pre-push-scratch",
  "private": true,
  "scripts": {
    "check:private": "\"$HARBOUR_REPO/node_modules/.bin/tsx\" \"$HARBOUR_REPO/scripts/check-private.ts\"",
    "check": "true"
  }
}
JSON
printf '.private-terms\n' > .gitignore
printf 'Fictional Owner\n' > .private-terms
"$LEFTHOOK_BIN" install >/dev/null

commit() { LEFTHOOK=0 git commit -q --allow-empty "$@"; }
fail() { echo "FAIL: $1" >&2; exit 1; }
# rejects <expected finding> <push args...>: the push must fail and report that finding.
rejects() {
  expected=$1
  shift
  if git push "$@" >"$SCRATCH/push.log" 2>&1; then fail "push $* succeeded; expected: $expected"; fi
  grep -q "$expected" "$SCRATCH/push.log" || { cat "$SCRATCH/push.log" >&2; fail "push $* failed without: $expected"; }
}
token="ghp_$(printf 'a%.0s' $(seq 36))"

git add -A && commit -m "chore: base"
git push -q -u origin main >"$SCRATCH/push.log" 2>&1 || { cat "$SCRATCH/push.log" >&2; fail "clean push was rejected"; }

# 1. A secret added then removed before pushing.
printf 'const key = "%s";\n' "$token" > leak.ts && git add leak.ts && commit -m "feat: add"
git rm -q leak.ts && commit -m "fix: remove"
rejects "GitHub token" origin main
git reset -q --hard origin/main

# 2. An owner term only in the commit message.
commit -m "feat: for Fictional Owner"
rejects 'term "Fictional Owner"' origin main
git reset -q --hard origin/main

# 3. Pushing a branch that is not checked out.
git checkout -q -b side
printf 'const key = "%s";\n' "$token" > leak.ts && git add leak.ts && commit -m "feat: add"
git rm -q leak.ts && commit -m "fix: remove"
git checkout -q main
rejects "GitHub token" origin side

echo "pre-push scan ok"
