import { raceAbort } from "./abort";

describe("raceAbort", () => {
  it("rejects with the abort reason while the promise is still pending", async () => {
    const controller = new AbortController();
    const pending = raceAbort(new Promise(() => {}), controller.signal);
    controller.abort(new Error("cancelled"));
    await expect(pending).rejects.toThrow("cancelled");
  });

  it("settles with the promise when no abort happens", async () => {
    await expect(raceAbort(Promise.resolve(1), new AbortController().signal)).resolves.toBe(1);
    await expect(raceAbort(Promise.reject(new Error("boom")), undefined)).rejects.toThrow("boom");
  });
});
