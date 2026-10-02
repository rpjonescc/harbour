import { filterHits } from "./hits";
import type { Hit } from "./schema";

// Built from code points: a literal invisible character in source cannot be reviewed.
const ZW = String.fromCharCode(0x200b);
const ZWJ = String.fromCharCode(0x200d);
const RLO = String.fromCharCode(0x202e);

const RULES = {
  excludeApps: [],
  terms: ["acme docs", "acme-docs"],
  productHost: "docs.example.com",
  neverMention: ["project zephyr"],
};
const hit = (text: string, extra: Partial<Hit> = {}): Hit => ({
  text,
  timestamp: "2026-10-01T10:00:00Z",
  app: "",
  window: "",
  ...extra,
});
const keep = (hits: Hit[], rules = RULES) => filterHits(hits, rules).kept;
const filler = (words: number, word = "lorem") => `${word} `.repeat(words);

describe("filterHits: excerpts", () => {
  it("keeps only the words around the term, not the rest of the screen dump", () => {
    const far = "faraway-marker";
    const [excerpt, ...rest] = keep([
      hit(`${far} ${filler(80)}Acme Docs sidebar fixed ${filler(80)} ${far}`),
    ]);
    expect(rest).toEqual([]);
    expect(excerpt).toContain("Acme Docs sidebar fixed");
    expect(excerpt).not.toContain(far);
    expect(excerpt?.length).toBeLessThanOrEqual(300);
  });

  it("merges excerpts whose context overlaps into one", () => {
    const kept = keep([
      hit(`Acme Docs one ${filler(5)} Acme Docs two ${filler(5)} acme-docs three`),
    ]);
    expect(kept).toHaveLength(1);
    expect(kept[0]).toMatch(/one.*two.*three/);
  });

  it("makes separate excerpts for far-apart occurrences, at most five per frame", () => {
    const frame = Array.from(
      { length: 12 },
      (_, i) =>
        `Acme Docs ${"abcdefghijkl"[i]}${"mnopq"[i % 5]} ${filler(70, `word${"abcdefghijkl"[i]}`)}`,
    ).join("");
    const kept = keep([hit(frame)]);
    expect(kept.length).toBeGreaterThan(1);
    expect(kept.length).toBeLessThanOrEqual(5);
    for (const excerpt of kept) expect(excerpt.length).toBeLessThanOrEqual(300);
  });

  it("matches the term in any case and with other characters between its letters", () => {
    expect(keep([hit("ACME DOCS shipped the new tab bar")])).toHaveLength(1);
    expect(keep([hit("the Acme-Docs repo moved")])).toHaveLength(1);
  });

  it("is not a failure when the term is only the start of a longer word", () => {
    const rules = { ...RULES, terms: ["doc"] };
    expect(keep([hit("Rewrote the documentation index")], rules)).toEqual([
      "Rewrote the documentation index",
    ]);
  });

  it("drops a frame with no on-topic term, and an empty or text-less one", () => {
    expect(
      keep([hit("Nothing relevant here"), hit(""), { text: 7 } as never, null as never]),
    ).toEqual([]);
  });
});

describe("filterHits: private-context cues drop the whole frame", () => {
  it.each([
    ["an inbox word", "Inbox (3) Acme Docs weekly"],
    ["sign-in wording far from the term", `Acme Docs ${filler(900)} Sign in to continue`],
    ["a password prompt", "Acme Docs notes. Password: ********"],
    ["a bank word", "Acme Docs and my Bank balance today"],
    ["an invoice", "Acme Docs Invoice 2041 total"],
    ["a one-time code", "Acme Docs one-time code 123456"],
    ["upper case", "ACME DOCS COMPOSE NEW MESSAGE"],
    ["zero-width characters inside the cue", `Acme Docs in${ZW}box and un${ZWJ}read`],
    ["a bidi control inside the cue", `Acme Docs pass${RLO}word`],
    ["full-width letters", "Acme Docs ｉｎｂｏｘ"],
    ["a Cyrillic lookalike letter", "Acme Docs іnbox"],
    ["a Greek lookalike letter", "Acme Docs ρassword"],
    ["letters spaced out", "Acme Docs p a s s w o r d"],
    ["a private window", "Acme Docs Private Browsing"],
    ["a health portal", "Acme Docs patient portal"],
    ["a tax portal", "Acme Docs tax return"],
  ])("%s", (_label, text) => {
    expect(keep([hit(text)])).toEqual([]);
  });

  it("does not read a cue inside an ordinary word", () => {
    for (const text of [
      "Acme Docs syntax highlighting",
      "Acme Docs taxonomy page",
      "Acme Docs emailed digest",
      "Acme Docs bankruptcy of the old build",
    ]) {
      expect(keep([hit(text)]), text).toHaveLength(1);
    }
  });

  it("applies the app and window deny-lists when the hit has them, and ignores empty ones", () => {
    expect(keep([hit("Acme Docs fixed", { app: "Slack", window: "general" })])).toEqual([]);
    expect(keep([hit("Acme Docs fixed", { app: "Editor", window: "Inbox - Mail" })])).toEqual([]);
    expect(keep([hit("Acme Docs fixed", { app: "Editor", window: "guide.md" })])).toHaveLength(1);
    expect(keep([hit("Acme Docs fixed", { app: "", window: "" })])).toHaveLength(1);
    expect(keep([hit("Acme Docs fixed", { app: "Editor", window: "" })])).toHaveLength(1);
  });

  it("reads a window name with bidi and zero-width characters by what it says", () => {
    const window = `Pr${RLO}ivate ${ZW}browsing`;
    expect(keep([hit("Acme Docs fixed", { app: "Browser", window })])).toEqual([]);
    expect(
      keep([hit("Acme Docs fixed", { app: `Br${RLO}owser`, window: "guide.md" })]),
    ).toHaveLength(1);
  });
});

describe("filterHits: redaction happens before excerpts are cut", () => {
  const TOKEN = "Zk3f9QwErTy7UiOp5AsDfGh1JkLzXcV2bNm4";

  it("catches a secret that the excerpt window would cut in half", () => {
    const out = keep([hit(`Acme Docs ${filler(50, "a")}${TOKEN} end`)]).join(" ");
    expect(out).toContain("Acme Docs");
    expect(out).not.toContain("Zk3f9Q");
    expect(out).not.toContain("UiOp5As");
  });

  it("catches an email, a key and a never-mention term at the edge of an excerpt", () => {
    const text = `Acme Docs ${filler(55, "x")}sam@example.com and sk-live-abcdefgh and Project Zephyr`;
    const out = keep([hit(text)]).join(" ");
    expect(out).not.toMatch(/sam@|sam|abcdefgh|Zephyr|ephyr/);
  });

  it("drops a hit whose only term is inside a link or a token", () => {
    expect(keep([hit("see https://example.net/acme-docs/page for more")])).toEqual([]);
    expect(keep([hit("attacker.example/acme docs my divorce lawyer said it was fine")])).toEqual(
      [],
    );
    expect(keep([hit("key acmedocs_Zk3f9QwErTy7UiOp5AsDfGh1JkLzXcV2")])).toEqual([]);
  });

  it("redacts every kind of secret in the excerpt that is kept", () => {
    const out = keep([
      hit("Acme Docs call +61 491 570 156 card 4111 1111 1111 1111 host 192.168.1.20 @samexample"),
    ]).join(" ");
    expect(out).not.toMatch(/491|4111|192\.168|samexample/);
  });
});

describe("filterHits: sampling and bounds", () => {
  it("drops the same frame seen many times and frames that differ only in digits", () => {
    const frames = Array.from({ length: 40 }, (_, i) =>
      hit(`Acme Docs fixed the sidebar at ${i}:00`),
    );
    expect(keep([...frames, ...frames])).toHaveLength(1);
  });

  it("keeps at most 30 excerpts, spread over the whole day rather than the first ones", () => {
    const hits = Array.from({ length: 100 }, (_, i) =>
      hit(
        `Acme Docs ${"abcdefghijklmnopqrstuvwxyz"[i % 26]}${"mnopqrstuv"[Math.floor(i / 26)]} step ${i} ${"x".repeat(i)}`,
        {
          timestamp: new Date(Date.UTC(2026, 9, 1, 0, i * 10)).toISOString(),
        },
      ),
    );
    const { kept, truncated } = filterHits(hits, RULES);
    expect(kept).toHaveLength(30);
    expect(truncated).toBe(true);
    const steps = kept.map((k) => Number(/step (\d+)/.exec(k)?.[1]));
    expect(Math.min(...steps)).toBeLessThan(5);
    expect(Math.max(...steps)).toBeGreaterThan(85);
  });

  it("orders by time whatever order the hits arrive in, with unreadable times last", () => {
    const kept = keep([
      hit("Acme Docs third", { timestamp: "garbage" }),
      hit("Acme Docs second", { timestamp: "2026-10-01T12:00:00Z" }),
      hit("Acme Docs first", { timestamp: "2026-10-01T08:00:00Z" }),
    ]);
    expect(kept.map((k) => k.replace("Acme Docs ", ""))).toEqual(["first", "second", "third"]);
  });

  it("stops at 24 KiB of excerpt text", () => {
    const frame = (i: number) => {
      const c = String.fromCodePoint(0x4e00 + i);
      return `${c.repeat(120)}Acme Docs${c.repeat(40)}Acme Docs${c.repeat(120)}`;
    };
    const { kept, truncated } = filterHits(
      Array.from({ length: 30 }, (_, i) => hit(frame(i))),
      RULES,
    );
    expect(kept.length).toBeLessThan(30);
    expect(truncated).toBe(true);
    expect(Buffer.byteLength(kept.join("\n"), "utf8")).toBeLessThanOrEqual(24 * 1024);
  });

  it("handles a frame with 50 terms without trouble", () => {
    const terms = Array.from({ length: 50 }, (_, i) => `termnumber${i}`);
    const frame = terms.join(" and ");
    const kept = keep([hit(frame)], { ...RULES, terms });
    expect(kept.length).toBeGreaterThan(0);
    expect(kept.length).toBeLessThanOrEqual(5);
  });

  it("skips frames past the work bound and says so", () => {
    const word = (i: number) =>
      `zq${i.toString(26).replace(/\d/g, (d) => String.fromCharCode(113 + Number(d)))}zq`;
    const hits = Array.from({ length: 400 }, (_, i) => hit(`Acme Docs unique frame ${word(i)}`));
    expect(filterHits(hits, RULES).truncated).toBe(true);
    const big = Array.from({ length: 20 }, (_, i) =>
      hit(`Acme Docs ${word(i)} ${"y".repeat(9_000)}`),
    );
    expect(filterHits(big, RULES).truncated).toBe(true);
  });

  it("drops a frame over the size cap instead of cutting it", () => {
    expect(keep([hit(`Acme Docs ${"z".repeat(10_001)}`)])).toEqual([]);
  });
});

describe("filterHits: hostile input takes bounded time", () => {
  const time = (hits: Hit[]) => {
    const start = performance.now();
    filterHits(hits, RULES);
    return performance.now() - start;
  };

  it.each([
    ["unclosed tags", `Acme Docs ${"<a".repeat(9_900)}`],
    ["a term then endless separators", `${"acme docs".split("").join(" ")}${" -".repeat(9_900)}`],
    ["the term repeated", "Acme Docs ".repeat(1_990)],
    ["one long run of a letter", `Acme Docs ${"a".repeat(19_900)}`],
    ["a long run of hex-like text", `Acme Docs ${"3f9a".repeat(4_900)}`],
    ["a long run of separators", `Acme Docs ${".:/-_".repeat(4_900)}`],
    ["cue letters spaced out", `Acme Docs ${"p a s s w o r ".repeat(1_400)}`],
    ["combining marks", `Acme Docs ${"é".repeat(9_900)}`],
  ])("%s", (_label, text) => {
    expect(time([hit(text)])).toBeLessThan(3_000);
  });
});
