import { activeNavHref, NAV_ITEMS } from "./nav-items";

const HREFS = NAV_ITEMS.map((item) => item.href);

describe("activeNavHref", () => {
  it.each([
    ["/", "/"],
    ["/settings", "/settings"],
    ["/settings/devices", "/settings/devices"],
    ["/settings/sources", "/settings/sources"],
    ["/settings/products/acme-docs", "/settings"],
    ["/brain/reports/weekly/2026-W39.md", "/brain"],
    ["/agents/12", "/agents"],
  ])("on %s marks %s", (pathname, expected) => {
    expect(activeNavHref(pathname, HREFS)).toBe(expected);
  });

  it("marks nothing on an unknown path or a sibling like /settingsx", () => {
    expect(activeNavHref("/products/acme-docs", HREFS)).toBeNull();
    expect(activeNavHref("/settingsx", HREFS)).toBeNull();
  });

  it("puts Settings after Devices", () => {
    expect(HREFS.indexOf("/settings")).toBe(HREFS.indexOf("/settings/devices") + 1);
  });
});
