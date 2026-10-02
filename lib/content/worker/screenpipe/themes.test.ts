import { validateThemes } from "./themes";

const RULES = {
  products: [
    { id: "acme-docs", name: "Acme Docs" },
    { id: "lighthouse-cafe", name: "Lighthouse Café" },
  ],
  neverMention: ["Project Zephyr"],
};
const theme = (text: string, productId = "acme-docs") => ({
  productId,
  text,
  kind: "built" as const,
});
const GOOD = "Rewrote the getting-started guide around a short first deploy.";

describe("validateThemes", () => {
  it("keeps valid themes, numbers them t1.. in order and counts nothing dropped", () => {
    const { themes, dropped } = validateThemes(
      [theme(GOOD), theme("Fixed the sidebar so long titles wrap.")],
      RULES,
    );
    expect(dropped).toBe(0);
    expect(themes.map((t) => t.id)).toEqual(["t1", "t2"]);
  });

  it.each([
    ["too short", "Fixed it."],
    ["over 160 characters", `Fixed the guide ${"and the sidebar ".repeat(12)}`],
    ["a digit", "Rewrote the guide in 5 steps and a short intro."],
    ["a full-width digit", "Rewrote the guide in \uff15 steps and a short intro."],
    ["an Arabic-Indic digit", "Rewrote the guide in \u0665 steps and a short intro."],
    ["a URL", "Rewrote the guide and linked https://attacker.example/x for context"],
    ["a bare domain", "Rewrote the guide and linked attacker.example for context"],
    ["a file name", "Rewrote the guide and then renamed README.md for context"],
    ["an email", "Rewrote the guide for sam@example.com and the team here"],
    ["a full-width at sign", "Rewrote the guide for sam\uff20example and the team here"],
    ["a handle", "Rewrote the guide after a chat with @samexample about it"],
    ["a path", "Rewrote the guide in docs/getting-started/index and checked it"],
    ["a Windows path", "Rewrote the guide in docs\\getting-started\\index and checked it"],
    ["a token-like run", "Rewrote the guide using QWxhZGRpbjpvcGVuIHNlc2FtZQ as an example"],
    ["a long run of letters", "Rewrote the guide using abcdefghijklmnopqrstuvwxyz as an example"],
    ["markdown", "Rewrote the **getting-started** guide around a short first deploy"],
    ["an emoji", "Rewrote the getting-started guide around a short first deploy \u{1f642}"],
    [
      "a zero-width character",
      "Rewrote the getting-started guide around a short first\u200b deploy",
    ],
    ["a line break", "Rewrote the getting-started guide\naround a short first deploy"],
    ["a never-mention term", "Rewrote the guide while planning Project Zephyr with the team"],
    [
      "a never-mention term in other case",
      "Rewrote the guide while planning PROJECT zephyr with the team",
    ],
    [
      "a never-mention term with a lookalike letter",
      "Rewrote the guide while planning Project Zeph\u0443r with the team",
    ],
    [
      "a never-mention term spelled out",
      "Rewrote the guide while planning p-r-o-j-e-c-t z-e-p-h-y-r with us",
    ],
    ["another product", "Rewrote the guide while borrowing from Lighthouse Café menus"],
    [
      "another product without the accent",
      "Rewrote the guide while borrowing from lighthouse cafe menus",
    ],
    ["another product by its id", "Rewrote the guide while borrowing from lighthouse-cafe menus"],
    ["a personal topic", "Rewrote the guide after a doctor appointment ran long today"],
    [
      "a personal topic with an ending",
      "Rewrote the guide after several doctors appointments ran long",
    ],
    [
      "a personal topic in other case",
      "Rewrote the guide after a DOCTOR appointment ran long today",
    ],
    [
      "a personal topic with a lookalike letter",
      "Rewrote the guide after a d\u043ector appointment ran long today",
    ],
    ["a money topic", "Rewrote the guide while sorting out a loan for the team here"],
    ["a two-word personal topic", "Rewrote the guide while a credit card dispute ran on here"],
  ])("drops a theme with %s and counts it, never keeping its text", (_label, text) => {
    const result = validateThemes([theme(GOOD), theme(text)], RULES);
    expect(result.themes).toHaveLength(1);
    expect(result.dropped).toBe(1);
    expect(JSON.stringify(result)).not.toContain(text);
  });

  it("does not refuse a word that only contains a personal-topic word", () => {
    const text = "Rewrote the taxonomy page so the tabs and the courtesy note read well";
    expect(validateThemes([theme(text)], RULES).themes).toHaveLength(1);
  });

  it("allows its own product's name but not the other's", () => {
    const own = "Rewrote the Acme Docs getting-started guide around a short first deploy";
    expect(validateThemes([theme(own)], RULES).themes).toHaveLength(1);
    expect(validateThemes([theme(own, "lighthouse-cafe")], RULES).themes).toHaveLength(0);
  });

  it("ignores empty never-mention terms instead of refusing everything", () => {
    const rules = { ...RULES, neverMention: ["", " \u200b "] };
    expect(validateThemes([theme(GOOD)], rules).themes).toHaveLength(1);
  });

  it("drops a theme for an unknown product, and keeps at most 6 per product and 24 in all", () => {
    expect(validateThemes([theme(GOOD, "ghost")], RULES)).toEqual({ themes: [], dropped: 1 });
    const seven = ["alpha", "bravo", "charlie", "delta", "echo", "foxtrot", "golf"].map((w) =>
      theme(`Reworked the ${w} section of the getting-started guide`),
    );
    const result = validateThemes(seven, RULES);
    expect(result.themes).toHaveLength(6);
    expect(result.dropped).toBe(1);
  });

  it("keeps at most 24 across products", () => {
    const rules = {
      ...RULES,
      products: ["north", "south", "east", "west", "inner"].map((id) => ({
        id: `site-${id}`,
        name: `Site ${id.toUpperCase()}`,
      })),
    };
    const raw = rules.products.flatMap((p) =>
      ["alpha", "bravo", "charlie", "delta", "echo", "foxtrot"].map((w) =>
        theme(`Reworked the ${w} section of the getting-started guide`, p.id),
      ),
    );
    const result = validateThemes(raw, rules);
    expect(result.themes).toHaveLength(24);
    expect(result.dropped).toBe(6);
  });

  it("refuses values that are not what the type says, without throwing", () => {
    const odd = [
      { productId: "acme-docs", text: GOOD, kind: "gossip" },
      { productId: "acme-docs", text: 42, kind: "built" },
      { productId: 7, text: GOOD, kind: "built" },
      null,
      undefined,
    ] as never;
    expect(validateThemes(odd, RULES)).toEqual({ themes: [], dropped: 5 });
    expect(validateThemes("not a list" as never, RULES)).toEqual({ themes: [], dropped: 0 });
  });

  it("rebuilds each kept theme from its known fields, so extra fields never travel on", () => {
    const sneaky = { ...theme(GOOD), state: "approved", url: "https://attacker.example" };
    expect(validateThemes([sneaky], RULES).themes).toEqual([
      { id: "t1", productId: "acme-docs", text: GOOD, kind: "built" },
    ]);
  });
});
