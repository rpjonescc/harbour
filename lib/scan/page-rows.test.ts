import { ACME_CRAWL, errorPage, htmlPage } from "@/tests/helpers/scoring";
import { pageRows } from "./page-rows";

const at = (path: string) => `https://docs.example.com${path}`;

describe("pageRows", () => {
  it("lists each page once with its problems, the most troubled first", () => {
    const { rows, total } = pageRows(ACME_CRAWL);
    expect(total).toBe(6);
    expect(rows.map((r) => [r.url, r.status, r.problems])).toEqual([
      [at("/about"), 200, ["Hidden from search"]],
      [at("/blog/launch"), 200, ["2 main headings"]],
      [at("/missing"), 404, ["Didn't load"]],
      [at("/"), 200, []],
      [at("/faq"), 200, []],
      [at("/guides/install"), 200, []],
    ]);
    expect(rows[0]?.title).toBe("A page title of fine length");
  });

  it("names missing titles, descriptions and h1s", () => {
    const { rows } = pageRows([
      htmlPage("/a", { title: null, titleLength: 0, descriptionLength: 0, h1Count: 0 }),
    ]);
    expect(rows[0]?.problems).toEqual(["Missing title", "Missing description", "No main heading"]);
  });

  it("leaves out a page whose stored URL is malformed rather than failing", () => {
    const bad = { ...htmlPage("/a"), subject: "not a url" };
    const badFinal = htmlPage("/b", { finalUrl: "::" });
    const { rows, total } = pageRows([bad, badFinal, htmlPage("/c")]);
    expect(rows.map((r) => r.url)).toEqual([at("/c")]);
    expect(total).toBe(1);
  });

  it("leaves out pages whose stored URLs are not http(s), so they never become links", () => {
    const script = { ...htmlPage("/a"), subject: "javascript:alert(1)" };
    const ftp = htmlPage("/b", { finalUrl: "ftp://example.com/b" });
    const { rows } = pageRows([script, ftp, htmlPage("/c")]);
    expect(rows.map((r) => r.url)).toEqual([at("/c")]);
  });

  it("keeps the first 50 rows and reports the total", () => {
    const pages = Array.from({ length: 60 }, (_, i) => errorPage(`/p${i}`, 500));
    const { rows, total } = pageRows(pages);
    expect(rows).toHaveLength(50);
    expect(total).toBe(60);
  });
});
