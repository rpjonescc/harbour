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

describe("hasPrivateCue: the plain words and other forms", () => {
  it.each([
    "email",
    "emails",
    "messages",
    "chat",
    "DMs",
    "Signal",
    "payment",
    "checkout",
    "billing",
    "statement",
    "balance",
    "OTP",
    "username",
    "credentials",
    "PIN",
    "SSN",
    "wallet",
    "seed phrase",
    "date of birth",
    "medical",
    "doctor",
    "signing in",
    "logging in",
    "signed in",
    "logged in",
  ])("fires for %s", (word) => {
    expect(hasPrivateCue(`Acme Docs ${word} here`), word).toBe(true);
  });

  it.each([
    ["a zero for o", "passw0rd"],
    ["a capital I for l", "Iog in"],
    ["a digit one for i or l", "1ogin"],
    ["rn for m", "rnail"],
    ["a trailing digit one", "Gmai1"],
    ["a bar for l", "|ogin"],
    ["a zero in a longer word", "Ph0ne passw0rd"],
  ])("sees through scanner mistakes: %s (%s)", (_label, text) => {
    expect(hasPrivateCue(`Acme Docs ${text}`)).toBe(true);
  });

  it.each([
    "Passwort",
    "Posteingang",
    "Anmelden",
    "Contraseña",
    "Contrasena",
    "Correo",
    "Mot de passe",
    "Connexion",
    "Senha",
    "Konto",
    "Kontostand",
    "Banque",
    "Banco",
    "Boîte de réception",
  ])("fires for the other-language word %s", (word) => {
    expect(hasPrivateCue(`Acme Docs ${word}`), word).toBe(true);
  });

  it.each(["t a x", "t-a-x", "b s b", "p i n", "s s n", "o t p", "2 f a"])(
    "fires for a short cue split by other characters: %s",
    (text) => {
      expect(hasPrivateCue(`Acme Docs ${text} here`), text).toBe(true);
    },
  );

  it("still does not fire inside ordinary words after the folding", () => {
    for (const text of [
      "Acme Docs syntax and taxonomy",
      "Acme Docs learn about turn and burn",
      "Acme Docs spinning pinned items",
      "Acme Docs 100 files built in 10 seconds",
    ]) {
      expect(hasPrivateCue(text), text).toBe(false);
    }
  });
});
