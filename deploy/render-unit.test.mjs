import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const script = fileURLToPath(new URL("./render-unit.mjs", import.meta.url));
const worker = fileURLToPath(new URL("./harbour-worker.service.template", import.meta.url));
const web = fileURLToPath(new URL("./harbour-web.service.template", import.meta.url));
const HOME = "/home/owner";

function render(template, claudePath = "") {
  const result = spawnSync(
    "node",
    [script, template, "/srv/harbour", "/opt/node/bin", claudePath],
    { encoding: "utf8", env: { ...process.env, HOME } },
  );
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
});
