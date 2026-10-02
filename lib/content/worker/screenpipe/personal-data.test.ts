import { hasPersonalData } from "./personal-data";

describe("hasPersonalData: real contact and payment shapes drop the frame", () => {
  it.each([
    ["an email", "Acme Docs mail sam@example.com"],
    ["an email with a lookalike letter", "Acme Docs sаm@example.com"],
    ["a full-width at sign", "Acme Docs sam＠example.com"],
    ["a link with a password", "Acme Docs https://sam:hunter2@example.com/x"],
    ["a link with a token parameter", "Acme Docs https://example.com/x?token=abcdef123456"],
    ["a card number in groups", "Acme Docs 4111 1111 1111 1111"],
    ["a card number with dashes", "Acme Docs 4111-1111-1111-1111"],
    ["a card number in one run", "Acme Docs 4111111111111111"],
    ["a 15-digit card", "Acme Docs 3782 822463 10005"],
    ["an international phone", "Acme Docs +61 412 345 678"],
    ["an international phone with brackets", "Acme Docs +44 (0) 20 7946 0958"],
    ["a bracketed national phone", "Acme Docs (02) 9999 1234"],
    ["a national mobile", "Acme Docs 0412 345 678"],
    ["a landline in groups", "Acme Docs 02 9999 1234"],
    ["a US phone with dashes", "Acme Docs 555-123-4567"],
    ["a US phone with dots", "Acme Docs 555.123.4567"],
    ["a US phone in brackets", "Acme Docs (555) 123-4567"],
  ])("%s", (_label, text) => {
    expect(hasPersonalData(text)).toBe(true);
  });
});

describe("hasPersonalData: what every screen shows does not drop it", () => {
  it.each([
    "Acme Docs 2026-10-01",
    "Acme Docs 03/10/2026",
    "Acme Docs 08:47:12",
    "Acme Docs v2.1.205",
    "Acme Docs #56",
    "Acme Docs 12:30",
    "Acme Docs 1,237 frames",
    "Acme Docs Oct 3 08:47",
    "Acme Docs 2026-10-03T08:47:12Z",
    "Acme Docs 12345678",
    "Acme Docs 4111111111111112", // fails the Luhn check, so not a card
  ])("keeps %s", (text) => {
    expect(hasPersonalData(text)).toBe(false);
  });

  const SCREENS = [
    "guide.md - Acme Docs - Editor",
    "src/app/page.tsx:120:45 error TS2322",
    "commit 3f9a1c5e7b2d4f6a8c0e1b3d5f7a9c1e Fix the sidebar",
    "a1b2c3d4 fix: wrap long titles",
    "$ pnpm test --run  Tests 4157 passed (4157)",
    "node 22.11.0 pnpm 9.12.1",
    "foo@1.2.3 and @types/node 22.1.0",
    "Duration 64.47s (tests 45%, import 23%)",
    "Updated Oct 3, 2026 at 08:47 by owner",
    "Fri 3 Oct  08:47:12",
    "PR #1234 merged 2 days ago, 18 commits",
    "line 1024 of 2048, column 12",
    "width: 1920px; height: 1080px; margin: 0 0 8px 0",
    "rgb(255, 128, 0) opacity 0.5",
    "192.168.1.20 localhost:3030 port 3030",
    "package.json 2,048 bytes modified 2026-09-30",
    "Acme Docs 100 files built in 10 seconds",
    "build 20261003.4 revision 118",
    "1759478400 seconds since the epoch",
    "https://docs.example.com/guide/start?page=2",
    "project/src/lib/index.ts",
    "SELECT count(*) FROM pages WHERE id > 100000",
    "Score 87/100  Accessibility 92  SEO 78",
    "12 of 30 checks passed, 2 warnings",
    "Tab 3 of 12  Window 2",
    "3.5 GB used of 16 GB, 4 cores at 2.4 GHz",
    "Version 0.1.0 (build 2026.10.03)",
    "Elapsed 00:12:45 remaining 00:03:10",
    "Q3 2026 report 12-page draft",
    "Updated 03/10/2026 08:47:12 UTC",
  ];
  it("keeps all 30 realistic screen strings", () => {
    expect(SCREENS).toHaveLength(30);
    for (const text of SCREENS) expect(hasPersonalData(`Acme Docs ${text}`), text).toBe(false);
  });
});
