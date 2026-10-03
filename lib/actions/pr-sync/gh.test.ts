import { chmodSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ghRunner, isAllowedGhCall, PR_FIELDS, prViewArgs } from "./gh";

const URL = "https://github.com/acme/widget/pull/12";

/** A fake `gh` on a private PATH: a shell script with `body`, logging its arguments. */
function fakeGh(body: string) {
  const dir = mkdtempSync(join(tmpdir(), "harbour-fake-gh-"));
  const script = join(dir, "gh");
  writeFileSync(script, `#!/bin/sh\necho "$@" > "${dir}/args.txt"\n${body}\n`);
  chmodSync(script, 0o755);
  const env = { PATH: `${dir}:/usr/bin:/bin`, HOME: dir, GH_TOKEN: "t0k3n", GITHUB_TOKEN: "t0k3n" };
  const ran = () => existsSync(join(dir, "args.txt"));
  const args = () => readFileSync(join(dir, "args.txt"), "utf8").trim();
  return { dir, env, ran, args };
}

describe("the gh allow-list", () => {
  it("allows exactly gh pr view <pull request URL> --json <the sync's fields>", () => {
    expect(prViewArgs(URL)).toEqual(["pr", "view", URL, "--json", PR_FIELDS]);
    expect(isAllowedGhCall(prViewArgs(URL))).toBe(true);
  });

  it.each([
    [["pr", "merge", URL]],
    [["pr", "merge", URL, "--json", PR_FIELDS]],
    [["pr", "close", URL]],
    [["pr", "comment", URL, "--body", "hello"]],
    [["pr", "edit", URL, "--title", "x"]],
    [["pr", "review", URL, "--approve"]],
    [["pr", "ready", URL]],
    [["api", "repos/acme/widget/pulls/12/merge", "-X", "PUT"]],
    [["auth", "token"]],
    [["pr", "view", URL, "--json", PR_FIELDS, "--web"]],
    [["pr", "view", URL, "--json", "state,body"]],
    [["pr", "view", URL, "--json"]],
    [["pr", "view", `${URL}/`, "--json", PR_FIELDS]],
    [["pr", "view", "https://example.com/acme/widget/pull/12", "--json", PR_FIELDS]],
    [["pr", "view", "--repo", "acme/widget", "--json", PR_FIELDS]],
    [["pr", "view", "12", "--json", PR_FIELDS]],
  ])("refuses %j", (args) => {
    expect(isAllowedGhCall(args)).toBe(false);
  });

  it("the runner throws on a call outside the list and never starts gh", async () => {
    const gh = fakeGh("exit 0");
    const run = ghRunner({ env: gh.env });
    expect(() => run(["pr", "merge", URL])).toThrow(/read-only allow-list/);
    expect(gh.ran()).toBe(false);
  });
});

describe("ghRunner with a fake gh", () => {
  it("returns gh's answer for the allowed call", async () => {
    const gh = fakeGh(`echo '{"state":"OPEN"}'`);
    const result = await ghRunner({ env: gh.env })(prViewArgs(URL));
    expect(result).toEqual({ ok: true, stdout: '{"state":"OPEN"}\n' });
    expect(gh.args()).toBe(`pr view ${URL} --json ${PR_FIELDS}`);
  });

  it("passes no token and disables prompts: only gh's own login is used", async () => {
    const gh = fakeGh(`env > "${"$"}HOME/env.txt"; echo '{}'`);
    await ghRunner({ env: gh.env })(prViewArgs(URL));
    const env = readFileSync(join(gh.dir, "env.txt"), "utf8");
    expect(env).not.toContain("t0k3n");
    expect(env).toContain("GH_PROMPT_DISABLED=1");
  });

  it.each([
    ["To get started with GitHub CLI, please run:  gh auth login", "not_logged_in"],
    ["HTTP 401: Bad credentials (https://api.github.com/graphql)", "not_logged_in"],
    ["GraphQL: API rate limit exceeded for user ID 1.", "rate_limited"],
    ["GraphQL: Could not resolve to a PullRequest with the number of 12.", "not_found"],
    ["something else broke", "failed"],
  ])("sorts the failure %j as %s", async (stderr, kind) => {
    const gh = fakeGh(`echo '${stderr}' >&2; exit 1`);
    const result = await ghRunner({ env: gh.env })(prViewArgs(URL));
    expect(result).toEqual({ ok: false, kind, detail: stderr });
  });

  it("reports gh missing from the PATH", async () => {
    const result = await ghRunner({ bin: "/nonexistent/gh", env: {} })(prViewArgs(URL));
    expect(result).toMatchObject({ ok: false, kind: "gh_missing" });
  });

  it("stops a call that takes longer than its timeout", async () => {
    const gh = fakeGh("sleep 5");
    const result = await ghRunner({ env: gh.env, timeoutMs: 200 })(prViewArgs(URL));
    expect(result).toMatchObject({ ok: false, kind: "timed_out" });
  });

  it("keeps terminal escapes out of the reported detail", async () => {
    const gh = fakeGh(`printf 'bad \\033[31mred\\033[0m\\n' >&2; exit 1`);
    const result = await ghRunner({ env: gh.env })(prViewArgs(URL));
    expect(result).toEqual({ ok: false, kind: "failed", detail: "bad red" });
  });
});
