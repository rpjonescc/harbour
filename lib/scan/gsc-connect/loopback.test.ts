import { startLoopback } from "./loopback";

const STATE = "expected-state-value";

async function get(url: string): Promise<{ status: number; body: string }> {
  const response = await fetch(url);
  return { status: response.status, body: await response.text() };
}

describe("startLoopback", () => {
  it("listens on 127.0.0.1 and resolves with the code from one valid callback", async () => {
    const loopback = await startLoopback({ state: STATE, timeoutMs: 5_000 });
    expect(loopback.redirectUri).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/callback$/);
    const page = await get(`${loopback.redirectUri}?state=${STATE}&code=the-auth-code`);
    expect(page.status).toBe(200);
    expect(page.body).toMatch(/close this tab/);
    expect(page.body).not.toContain("the-auth-code");
    await expect(loopback.code).resolves.toBe("the-auth-code");
    // The server is gone once it has its answer.
    await expect(fetch(loopback.redirectUri)).rejects.toThrow();
  });

  it("rejects a callback with the wrong or no state with 400 and keeps waiting", async () => {
    const loopback = await startLoopback({ state: STATE, timeoutMs: 5_000 });
    expect((await get(`${loopback.redirectUri}?state=wrong&code=forged`)).status).toBe(400);
    expect((await get(`${loopback.redirectUri}?code=forged`)).status).toBe(400);
    expect((await get(loopback.redirectUri.replace("/callback", "/favicon.ico"))).status).toBe(404);
    await get(`${loopback.redirectUri}?state=${STATE}&code=real-code`);
    await expect(loopback.code).resolves.toBe("real-code");
  });

  it("fails when Google reports the sign-in was not completed", async () => {
    const loopback = await startLoopback({ state: STATE, timeoutMs: 5_000 });
    const failed = expect(loopback.code).rejects.toThrow(/did not complete \(access_denied\)/);
    const page = await get(`${loopback.redirectUri}?state=${STATE}&error=access_denied`);
    expect(page.status).toBe(400);
    await failed;
  });

  it("gives up after its timeout and stops listening", async () => {
    const loopback = await startLoopback({ state: STATE, timeoutMs: 50 });
    await expect(loopback.code).rejects.toThrow(/No answer from Google sign-in within/);
    await expect(fetch(loopback.redirectUri)).rejects.toThrow();
  });

  it("gives up after too many unexpected requests", async () => {
    const loopback = await startLoopback({ state: STATE, timeoutMs: 5_000, maxRequests: 3 });
    const failed = expect(loopback.code).rejects.toThrow(/Too many unexpected requests/);
    for (let i = 0; i < 3; i++) await get(`${loopback.redirectUri}?state=wrong`).catch(() => null);
    await failed;
  });
});
