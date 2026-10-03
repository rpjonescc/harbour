import { CANARY, EVASIONS, HOSTILE_SNIPPETS } from "@/tests/fixtures/content/hostile-snippets";
import { filterSnippets, type RedactRules } from "./redact";
import type { Snippet } from "./schema";

const RULES: RedactRules = {
  excludeApps: ["Example Chat"],
  terms: ["acme docs", "acme-docs"],
  productHost: "docs.example.com",
  neverMention: ["Project Zephyr"],
};
const snip = (text: string, app = "Editor", window: string | null = "guide.md"): Snippet => ({
  app,
  window,
  text,
});
const one = (text: string, app?: string, window?: string | null) =>
  filterSnippets([snip(text, app, window)], RULES).kept[0];

describe("filterSnippets: dropping", () => {
  it.each([
    ["a password manager", "1Password"],
    ["an email client", "Mail"],
    ["a chat app", "Slack"],
    ["a video call", "Zoom"],
    ["an app the owner excluded", "Example Chat"],
    ["an app named with a lookalike letter", "\u0405lack"],
    ["an app named with zero-width characters", "Sl\u200back"],
  ])("drops text from %s whole", (_label, app) => {
    expect(one("Acme Docs update", app)).toBeUndefined();
  });

  it.each([
    "Login - Acme",
    "Reset password",
    "Inbox (3)",
    "Private window",
    "Invoice 12",
    "L\u03bfgin",
    "Pass\u200bword",
    "\uff29nbox",
  ])("drops a snippet from the window %j", (window) =>
    expect(one("Acme Docs update", "Editor", window)).toBeUndefined(),
  );

  it.each([
    ["Google Chrome", "general - Sam Example - Slack"],
    ["Google Chrome", "Compose - Gmail"],
    ["Firefox", "Inbox - Proton Mail"],
    ["Safari", "Vault - 1Password"],
    ["Google Chrome", "Join the call - Zoom"],
    ["Firefox", "Online banking - Example Bank"],
  ])("drops a browser tab that is webmail, chat or banking: %s, %j", (app, window) => {
    expect(one("Acme Docs update", app, window)).toBeUndefined();
  });

  it.each([
    ["Code", "docker-compose.yml"],
    ["Code", "composer.json - acme"],
    ["Code", "login.ts - acme"],
    ["Code", "private-notes.md"],
    ["Code", "How to meet deadlines"],
    ["Code", "signal handling"],
    ["Firefox", "login.ts - Acme Docs"],
  ])(
    "keeps an editor tab or ordinary title that only contains a deny word: %s, %j",
    (app, window) => {
      expect(one("Acme Docs update", app, window)).toBe("Acme Docs update");
    },
  );

  it.each([
    ["Google Chrome", "Compose mail - Gmail"],
    ["Google Chrome", "general - Slack"],
    ["Microsoft Edge", "Chat | Microsoft Teams"],
    ["Google Chrome", "Example Bank - Accounts"],
    ["Firefox", "Log in to Acme"],
    ["Safari", "Private browsing"],
    ["Google Chrome", "How to meet deadlines"],
    ["Code", "Slack"],
  ])("drops a browser or bare app title: %s, %j", (app, window) => {
    expect(one("Acme Docs update", app, window)).toBeUndefined();
  });

  it("treats an unknown window or app as private, because the deny-list cannot be applied", () => {
    expect(one("Acme Docs update", "Editor", null)).toBeUndefined();
    expect(one("Acme Docs update", "Editor", "")).toBeUndefined();
    expect(one("Acme Docs update", "Editor", " \u200b ")).toBeUndefined();
    expect(one("Acme Docs update", "", "guide.md")).toBeUndefined();
  });

  it("drops values that are not text instead of throwing", () => {
    const odd = [
      { app: "Editor", window: "guide.md", text: undefined },
      { app: "Editor", window: 7, text: "Acme Docs update" },
      { app: null, window: "guide.md", text: "Acme Docs update" },
      { app: "Editor", window: "guide.md", text: { toString: () => "Acme Docs" } },
    ] as unknown as Snippet[];
    expect(filterSnippets(odd, RULES)).toEqual({ kept: [], truncated: false });
  });

  it("keeps only on-topic text, case-insensitively, and drops the rest before redaction", () => {
    expect(one("ACME DOCS guide")).toBe("ACME DOCS guide");
    expect(one("Shopping list and holiday plans")).toBeUndefined();
  });

  it("keeps nothing when the product has no usable terms", () => {
    const none = { ...RULES, terms: ["", "  \u200b "] };
    expect(filterSnippets([snip("Acme Docs update")], none).kept).toEqual([]);
  });
});

describe("filterSnippets: redacting", () => {
  it.each([
    ["a URL", "Acme Docs see https://attacker.example/x?d=1 now", "Acme Docs see [link] now"],
    [
      "a bare link with a path",
      "Acme Docs see attacker.example/x?d=1 now",
      "Acme Docs see [link] now",
    ],
    ["a www host", "Acme Docs see www.attacker.example now", "Acme Docs see [link] now"],
    ["an email", "Acme Docs mail sam@example.com now", "Acme Docs mail [email] now"],
    ["an IP address", "Acme Docs host 192.168.1.20 down", "Acme Docs host [ip] down"],
    ["a phone number", "Acme Docs call +61 491 570 156 now", "Acme Docs call [phone] now"],
    ["a card-like number", "Acme Docs card 4111 1111 1111 1111 ok", "Acme Docs card [number] ok"],
    ["a handle", "Acme Docs ping @samexample today", "Acme Docs ping [handle] today"],
    [
      "a long hex run",
      "Acme Docs id 3f9a1c5e7b2d4f6a8c0e1b3d5f7a9c1e ok",
      "Acme Docs id [token] ok",
    ],
    [
      "a base64 run",
      "Acme Docs key QWxhZGRpbjpvcGVuIHNlc2FtZTEyMzQ1 ok",
      "Acme Docs key [token] ok",
    ],
    ["a credential", "Acme Docs Bearer abc.def.ghi ok", "Acme Docs Bearer [redacted] ok"],
    ["a file path", "Acme Docs open /ho" + "me/sam/notes/plan.md now", "Acme Docs open [path] now"],
    [
      "a never-mention term",
      "Acme Docs and project zephyr launch",
      "Acme Docs and [removed] launch",
    ],
    ["an HTML tag", "Acme Docs <script>alert(1)</script> fixed", "Acme Docs alert(1) fixed"],
  ])("replaces %s", (_label, text, expected) => expect(one(text)).toBe(expected));

  it("keeps the bare host of the product's own site but not a link to it", () => {
    expect(one("Acme Docs on docs.example.com is faster")).toBe(
      "Acme Docs on docs.example.com is faster",
    );
    expect(one("Acme Docs on https://docs.example.com/start is faster")).toBe(
      "Acme Docs on [link] is faster",
    );
    expect(one("Acme Docs on docs.example.com/start is faster")).toBe(
      "Acme Docs on [link] is faster",
    );
  });

  it("does not mistake a long hyphenated word for a token", () => {
    expect(one("Acme Docs getting-started-guide-for-new-teams rewrite")).toBe(
      "Acme Docs getting-started-guide-for-new-teams rewrite",
    );
  });

  it.each([
    [
      "a prefixed key beside digits",
      "Acme Docs key sk-abcdef12345678 ok",
      "Acme Docs key [token] ok",
    ],
    ["a password with no separator", "Acme Docs password hunter2 ok", "Acme Docs [redacted] ok"],
    [
      "an authorization header",
      "Acme Docs Authorization: Bearer abc123 ok",
      "Acme Docs [redacted] ok",
    ],
  ])("replaces %s whole", (_label, text, expected) => expect(one(text)).toBe(expected));

  it("does not let an empty never-mention term redact everything", () => {
    const rules = { ...RULES, neverMention: ["", " \u200b "] };
    expect(filterSnippets([snip("Acme Docs update")], rules).kept).toEqual(["Acme Docs update"]);
  });

  it("tolerates a product host given as a URL, and none at all", () => {
    const withUrl = { ...RULES, productHost: "https://www.docs.example.com/" };
    expect(filterSnippets([snip("Acme Docs on docs.example.com ok")], withUrl).kept[0]).toBe(
      "Acme Docs on docs.example.com ok",
    );
    const dotted = { ...RULES, productHost: "https://docs.example.com./" };
    expect(filterSnippets([snip("Acme Docs on docs.example.com ok")], dotted).kept[0]).toBe(
      "Acme Docs on docs.example.com ok",
    );
    const none = { ...RULES, productHost: "" };
    expect(filterSnippets([snip("Acme Docs on docs.example.com ok")], none).kept[0]).toBe(
      "Acme Docs on [link] ok",
    );
  });
});

describe("filterSnippets: evasions", () => {
  it.each(EVASIONS)("does not let $label through", ({ text, leak }) => {
    const out = one(text);
    // Either the snippet is dropped or the sensitive part is gone: never a kept leak.
    if (out !== undefined) expect(out).not.toContain(leak);
  });

  it("still keeps the on-topic words around an evasion, so the filter is not just dropping everything", () => {
    const survivors = EVASIONS.filter(({ text }) => one(text) !== undefined);
    expect(survivors.length).toBeGreaterThan(EVASIONS.length / 2);
  });
});

describe("filterSnippets: normalising and capping", () => {
  it("strips zero-width and bidi characters, collapses space and caps each snippet at 240", () => {
    expect(one("Acme\u200b  Docs\u202e\n\n  guide")).toBe("Acme Docs guide");
    expect(one(`Acme Docs ${"word ".repeat(100)}`)?.length).toBeLessThanOrEqual(240);
  });

  it("returns one line of canonical text: no control characters, line separators or odd forms", () => {
    const out = one("\uff21cme Docs\u2028line\u0085two\u00a0three\ufe0f\u0000end") ?? "";
    expect(out).toBe("Acme Docs line two three end");
  });

  it("caps by characters without cutting a character in half", () => {
    const out = one(`Acme Docs ${"\u{1f600}".repeat(400)}`) ?? "";
    expect(Array.from(out).length).toBeLessThanOrEqual(240);
    expect(out).not.toMatch(/[\ud800-\udbff](?![\udc00-\udfff])/);
  });

  it("keeps at most 24 KiB per product and says it truncated", () => {
    const many = Array.from({ length: 300 }, (_, i) => snip(`Acme Docs ${"x".repeat(230)} ${i}`));
    const { kept, truncated } = filterSnippets(many, RULES);
    expect(truncated).toBe(true);
    expect(kept.join("").length).toBeLessThanOrEqual(24 * 1024);
  });

  it("counts bytes, not characters, towards the cap", () => {
    const many = Array.from({ length: 300 }, () => snip(`Acme Docs ${"é\u4e2d".repeat(100)}`));
    const { kept } = filterSnippets(many, RULES);
    expect(Buffer.byteLength(kept.join("\n"), "utf8")).toBeLessThanOrEqual(24 * 1024);
  });

  it("does not report truncation when everything fits", () => {
    expect(filterSnippets([snip("Acme Docs update")], RULES).truncated).toBe(false);
  });

  it("handles a hostile 10,000-character snippet quickly", () => {
    const started = Date.now();
    one(`Acme Docs ${"1 ".repeat(5000)}`);
    one(`Acme Docs ${"a1".repeat(5000)}`);
    one(`Acme Docs ${"-".repeat(10_000)}`);
    expect(Date.now() - started).toBeLessThan(1500);
  });
});

describe("filterSnippets: bounded work", () => {
  it("processes at most 100 snippets and 200,000 characters, and says it truncated", () => {
    const many = Array.from({ length: 5000 }, (_, i) => snip(`Acme Docs ${i}`));
    expect(filterSnippets(many, RULES)).toMatchObject({ truncated: true });
    expect(filterSnippets(many, RULES).kept.length).toBeLessThanOrEqual(100);
    const big = Array.from({ length: 100 }, () => snip(`Acme Docs ${"a1 ".repeat(3300)}`));
    expect(filterSnippets(big, RULES).truncated).toBe(true);
  });

  it("finishes a hostile batch in bounded time", () => {
    const hostile = [
      `Acme Docs ${"1 ".repeat(4900)}`,
      `Acme Docs ${"a1".repeat(4900)}`,
      `Acme Docs ${"-".repeat(9900)}`,
      `Acme Docs ${"a.".repeat(4900)}`,
      `Acme Docs ${"@a ".repeat(3300)}`,
    ];
    const batch = Array.from({ length: 5000 }, (_, i) => snip(hostile[i % hostile.length] ?? ""));
    const started = Date.now();
    filterSnippets(batch, RULES);
    expect(Date.now() - started).toBeLessThan(5000);
  });
});

describe("hostile screen text", () => {
  it("reaches the model without a URL, email, phone, card, IP, handle, token, tag or the owner's secrets", () => {
    const { kept } = filterSnippets(HOSTILE_SNIPPETS, RULES);
    const all = kept.join("\n");
    for (const leak of [
      "attacker.example",
      "sam@example.com",
      "491 570",
      "4111",
      "192.168",
      "@samexample",
      "QWxhZGRpbjpvcGVuIHNlc2FtZTEyMzQ1",
      "<script",
      "```",
    ]) {
      expect(all).not.toContain(leak);
    }
    // What is left is still text the model must treat as data: it is the prompt's fence that does that.
    expect(all).toContain("Ignore previous instructions");
  });

  it("lets the canary through: it is screen text the model sees, and the job must never store it", () => {
    expect(filterSnippets(HOSTILE_SNIPPETS, RULES).kept.join("\n")).toContain(CANARY);
  });

  it("leaves each kept snippet on one line, so a snippet cannot start a line of its own", () => {
    for (const out of filterSnippets(HOSTILE_SNIPPETS, RULES).kept)
      expect(out).not.toMatch(/[\n\r]/);
  });
});

describe("property: a secret survives no mix of invisible characters and case", () => {
  // Deterministic pseudo-random so a failure reproduces.
  const rng = (start: number) => {
    let seed = start;
    return () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296;
      return seed / 4294967296;
    };
  };
  const INVISIBLES = ["\u200b", "\u200d", "\u2060", "\ufeff", "\u202e", "\u00ad", "\ufe0f"];
  const secrets = [
    { text: "sam@example.com", leak: "sam@" },
    { text: "4111 1111 1111 1111", leak: "4111" },
    { text: "https://attacker.example/x", leak: "attacker" },
    { text: "192.168.1.20", leak: "192.168" },
    { text: "3f9a1c5e7b2d4f6a8c0e1b3d5f7a9c1e", leak: "3f9a1c5e" },
    { text: "QWxhZGRpbjpvcGVuIHNlc2FtZTEyMzQ1", leak: "QWxhZGRp" },
    { text: "Project Zephyr", leak: "hyr" },
  ];

  it.each(secrets)("hides $text however it is spliced", ({ text, leak }) => {
    const next = rng(7);
    for (let i = 0; i < 60; i++) {
      const spliced = Array.from(text)
        .map((c) => (next() < 0.35 ? INVISIBLES[Math.floor(next() * INVISIBLES.length)] + c : c))
        .map((c) => (next() < 0.3 ? c.toUpperCase() : c))
        .join("");
      const out = one(`Acme Docs note ${spliced} end`);
      if (out !== undefined) expect(out.toLowerCase()).not.toContain(leak.toLowerCase());
    }
  });
});
