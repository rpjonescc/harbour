#!/usr/bin/env node
// Renders a Harbour systemd unit template to stdout.
// Usage: node render-unit.mjs <template> <repo> <node-bin-dir> [claude-path]
// claude-path is where `command -v claude` found the CLI (empty if not found). Its directory is
// added in front of the unit's PATH unless the PATH already has it, so the worker can run
// `claude` even when it lives outside the default directories (e.g. a version manager's bin).
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname } from "node:path";

const [template, repo, nodeBin, claudePath = ""] = process.argv.slice(2);
if (!template || !repo || !nodeBin) {
  console.error("usage: render-unit.mjs <template> <repo> <node-bin-dir> [claude-path]");
  process.exit(2);
}

const home = process.env.HOME || homedir();
const base = readFileSync(template, "utf8")
  .replaceAll("__REPO__", repo)
  .replaceAll("__NODE_BIN__", nodeBin);
const pathDirs = (/^Environment=PATH=(.*)$/m.exec(base)?.[1] ?? "")
  .replaceAll("__EXTRA_PATH__", "")
  .replaceAll("%h", home)
  .split(":");
const claudeDir = claudePath ? dirname(claudePath) : "";
const extra = claudeDir && !pathDirs.includes(claudeDir) ? `${claudeDir}:` : "";
process.stdout.write(base.replaceAll("__EXTRA_PATH__", extra));
