import { deepLinkedId, everyStatusHref } from "./deep-link";

describe("deepLinkedId", () => {
  it("reads the action id from a card link", () => {
    expect(deepLinkedId("#action-12")).toBe(12);
  });

  it("ignores other hashes", () => {
    for (const hash of ["", "#column-queue", "#action-12-title", "#action-", "#action-1x"]) {
      expect(deepLinkedId(hash)).toBeNull();
    }
  });
});

describe("everyStatusHref", () => {
  const at = (path: string) => new URL(path, "https://harbour.example.com");

  it("points at the full list, keeping the product and area", () => {
    expect(everyStatusHref(at("/actions?product=acme-docs&area=SEO&focus=stuck#action-5"), 5)).toBe(
      "/actions?product=acme-docs&area=SEO&view=list&status=all#action-5",
    );
  });

  it("is null when the page already is the full list", () => {
    expect(everyStatusHref(at("/actions?view=list&status=all#action-5"), 5)).toBeNull();
  });
});
