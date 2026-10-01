#!/bin/sh
# A lefthook *script*, not a command: pre-push commands are skipped when the pushed tree
# matches the remote (e.g. a secret added then removed), but scripts always run.
exec pnpm --silent check:private --commits
