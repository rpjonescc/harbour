#!/bin/sh
# A script so it runs even when lefthook finds no changed push files.
# Git exports GIT_DIR (and friends) to hooks; tests create scratch repos, so drop them.
unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE GIT_COMMON_DIR GIT_OBJECT_DIRECTORY GIT_PREFIX
exec pnpm check
