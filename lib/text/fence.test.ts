import { fenceFor } from "./fence";

describe("fenceFor", () => {
  it("is three backticks for text without backticks", () => {
    expect(fenceFor("https://docs.example.com/a")).toBe("```");
    expect(fenceFor("")).toBe("```");
  });

  it("stays at three when the text only has shorter runs", () => {
    expect(fenceFor("a `code` and ``more``")).toBe("```");
  });

  it("is one longer than the longest backtick run", () => {
    expect(fenceFor("a ``` b")).toBe("````");
    expect(fenceFor("x ```` y ``````` z")).toBe("````````");
  });
});
