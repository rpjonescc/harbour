import { rejectCrossSite } from "./same-origin";

const origin = "https://pc.tail.ts.net";
const req = (headers: Record<string, string>) =>
  new Request(`${origin}/api/x`, { method: "POST", headers });

describe("rejectCrossSite", () => {
  it("allows same-origin JSON requests", () => {
    expect(rejectCrossSite(req({ origin, "content-type": "application/json" }), origin)).toBeNull();
  });

  it("rejects other origins and missing origin", () => {
    const evil = rejectCrossSite(
      req({ origin: "https://evil.example", "content-type": "application/json" }),
      origin,
    );
    expect(evil?.status).toBe(403);
    expect(rejectCrossSite(req({ "content-type": "application/json" }), origin)?.status).toBe(403);
  });

  it("rejects non-JSON bodies (form posts cannot be forged cross-site as JSON)", () => {
    const form = rejectCrossSite(
      req({ origin, "content-type": "application/x-www-form-urlencoded" }),
      origin,
    );
    expect(form?.status).toBe(415);
  });
});
