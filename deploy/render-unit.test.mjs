import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const script = fileURLToPath(new URL("./render-unit.mjs", import.meta.url));
const worker = fileURLToPath(new URL("./harbour-worker.service.template", import.meta.url));
const web = fileURLToPath(new URL("./harbour-web.service.template", import.meta.url));
const sync = fileURLToPath(new URL("./harbour-board-sync.service.template", import.meta.url));
const timer = fileURLToPath(new URL("./harbour-board-sync.timer.template", import.meta.url));
const HOME = "/home/owner";

function render(template, toolPath = "") {
  const result = spawnSync("node", [script, template, "/srv/harbour", "/opt/node/bin", toolPath], {
    encoding: "utf8",
    env: { ...process.env, HOME },
  });
  expect(result.stderr).toBe("");
  expect(result.status).toBe(0);
  return result.stdout;
}

const pathLine = (unit) => unit.split("\n").find((l) => l.startsWith("Environment=PATH="));

describe("render-unit", () => {
  it("puts the user's ~/.local/bin (where claude installs) on the worker's PATH", () => {
    const unit = render(worker);
    expect(pathLine(unit)).toBe("Environment=PATH=/opt/node/bin:%h/.local/bin:/usr/bin:/bin");
    expect(unit).toContain("WorkingDirectory=/srv/harbour");
    expect(unit).toContain("ExecStart=/opt/node/bin/pnpm worker");
    expect(unit).not.toMatch(/__[A-Z_]+__/);
  });

  it("adds claude's directory when it is not already on the PATH", () => {
    expect(pathLine(render(worker, "/opt/claude/bin/claude"))).toBe(
      "Environment=PATH=/opt/claude/bin:/opt/node/bin:%h/.local/bin:/usr/bin:/bin",
    );
    expect(pathLine(render(worker, `${HOME}/.local/bin/claude`))).toBe(
      "Environment=PATH=/opt/node/bin:%h/.local/bin:/usr/bin:/bin",
    );
    expect(pathLine(render(worker, "/usr/bin/claude"))).toBe(
      "Environment=PATH=/opt/node/bin:%h/.local/bin:/usr/bin:/bin",
    );
  });

  it("renders the web unit without leftover placeholders", () => {
    expect(render(web)).not.toMatch(/__[A-Z_]+__/);
  });

  it("is what install.sh uses for both units", () => {
    const install = readFileSync(fileURLToPath(new URL("./install.sh", import.meta.url)), "utf8");
    expect(install).toMatch(/render-unit\.mjs"? "\$REPO\/deploy\/harbour-web\.service\.template"/);
    expect(install).toMatch(
      /render-unit\.mjs"? "\$REPO\/deploy\/harbour-worker\.service\.template"/,
    );
  });

  it("renders the board sync as a niced, time-limited one-shot run of pnpm actions sync-prs", () => {
    const unit = render(sync, "/opt/gh/bin/gh");
    expect(unit).not.toMatch(/__[A-Z_]+__/);
    expect(unit).toContain("Type=oneshot");
    expect(unit).toContain("WorkingDirectory=/srv/harbour");
    expect(unit).toContain("ExecStart=/opt/node/bin/pnpm actions sync-prs");
    expect(unit).toMatch(/^Nice=\d+$/m);
    expect(unit).toMatch(/^TimeoutStartSec=\S+$/m);
    expect(pathLine(unit)).toBe(
      "Environment=PATH=/opt/gh/bin:/opt/node/bin:%h/.local/bin:/usr/bin:/bin",
    );
  });

  it("runs the board sync hourly with up to 5 minutes of random delay", () => {
    const unit = render(timer);
    expect(unit).not.toMatch(/__[A-Z_]+__/);
    expect(unit).toContain("OnCalendar=hourly");
    expect(unit).toContain("RandomizedDelaySec=5min");
    expect(unit).toContain("WantedBy=timers.target");
  });

  it("is how install.sh installs and enables the board sync, unless it is turned off", () => {
    const install = readFileSync(fileURLToPath(new URL("./install.sh", import.meta.url)), "utf8");
    expect(install).toMatch(
      /render-unit\.mjs"? "\$REPO\/deploy\/harbour-board-sync\.service\.template" "\$REPO" "\$NODE_BIN" "\$GH_PATH"/,
    );
    expect(install).toMatch(
      /render-unit\.mjs"? "\$REPO\/deploy\/harbour-board-sync\.timer\.template"/,
    );
    expect(install).toContain("systemctl --user enable --now harbour-board-sync.timer");
    expect(install).toContain("systemctl --user disable --now harbour-board-sync.timer");
  });
});
