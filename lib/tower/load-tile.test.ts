import { loadTile } from "./load-tile";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("loadTile", () => {
  it("returns the reader's data", () => {
    expect(loadTile("systems", () => [1, 2])).toEqual({ ok: true, data: [1, 2] });
  });

  it("keeps an empty answer as a real, successful empty answer", () => {
    expect(loadTile("needs", () => [])).toEqual({ ok: true, data: [] });
  });

  it("returns a failure with the error and logs it once with the tile's name", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const result = loadTile("activity", () => {
      throw new TypeError("no such table: jobs");
    });
    expect(result).toEqual({ ok: false, detail: "TypeError: no such table: jobs" });
    expect(error).toHaveBeenCalledTimes(1);
    expect(String(error.mock.calls[0]?.[0])).toBe(
      'tower tile "activity" failed: TypeError: no such table: jobs',
    );
  });

  it("describes a thrown value that is not an Error", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const read = (): number => {
      throw "boom";
    };
    expect(loadTile("wins", read)).toEqual({
      ok: false,
      detail: "boom",
    });
  });
});
