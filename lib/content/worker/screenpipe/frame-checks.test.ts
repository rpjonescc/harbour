import { hasPrivateCue } from "./frame-checks";
import { PRIVATE_CUES } from "./private-cues";

describe("hasPrivateCue", () => {
  it("fires for every cue in the list, as written and in capitals", () => {
    for (const cue of PRIVATE_CUES) {
      expect(hasPrivateCue(`some words ${cue} more words`), cue).toBe(true);
      expect(hasPrivateCue(cue.toUpperCase()), cue).toBe(true);
    }
  });

  it("allows a plural and other characters between the letters of a longer cue", () => {
    expect(hasPrivateCue("three invoices")).toBe(true);
    expect(hasPrivateCue("i-n-b-o-x")).toBe(true);
    expect(hasPrivateCue("sign-in page")).toBe(true);
  });

  it("does not fire for plain developer and writing text", () => {
    for (const text of [
      "Fixed the syntax error in the sidebar component",
      "Taxonomy of page types",
      "Rewrote the getting-started guide",
      "The patience of a saint",
      "Added a banner to the docs site",
    ]) {
      expect(hasPrivateCue(text), text).toBe(false);
    }
  });

  it("is fast on a long frame", () => {
    const start = performance.now();
    hasPrivateCue("word ".repeat(4_000));
    hasPrivateCue("p a s s w o r ".repeat(1_400));
    expect(performance.now() - start).toBeLessThan(1_000);
  });
});
