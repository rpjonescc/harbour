import { extractPage } from "./html";
import { isQuestion } from "./questions";

const PAGE_URL = "https://docs.example.com/guide/faq";
const page = (body: string) => `<!doctype html><html><head></head><body>${body}</body></html>`;
const words = (n: number) => Array.from({ length: n }, (_, i) => `w${i}`).join(" ");

describe("isQuestion", () => {
  it.each([
    "How do I book?",
    "What is a pet passport",
    "How much does it cost",
    "How long does delivery take",
    "When should I renew",
    "Is it free?",
    "Pricing?",
  ])("treats %j as a question", (text) => {
    expect(isQuestion(text)).toBe(true);
  });

  it.each([
    "Who we are",
    "What we do",
    "Why choose us",
    "Why choose us?",
    "How-to guides",
    "Our story",
    "How it works",
    "Installation",
    "Whatever you need",
    "",
    "   ",
  ])("does not treat %j as a question", (text) => {
    expect(isQuestion(text)).toBe(false);
  });
});

describe("extractPage question headings", () => {
  it("counts question headings and those answered by a short paragraph right below", () => {
    const html = page(`
      <h1>Acme Docs FAQ</h1>
      <h2>How do I install it?</h2><p>Run the installer and follow the prompts.</p>
      <h3>What does it cost?</h3><p>${words(60)}</p>
      <h3>Why is it slow?</h3><p>${words(61)}</p>
      <h2>Can I export to PDF?</h2><ul><li>Yes</li></ul><p>Short.</p>
      <h4>Where is my data?</h4>
      <h2>Changelog</h2><p>Short.</p>
      <h2>Is there an API?</h2><p>   </p>`);
    expect(extractPage(html, PAGE_URL)).toMatchObject({ questionHeadings: 6, conciseAnswers: 2 });
  });

  it("reports zero for a page without question headings", () => {
    const html = page("<h1>Start</h1><p>Hello</p>");
    expect(extractPage(html, PAGE_URL)).toMatchObject({ questionHeadings: 0, conciseAnswers: 0 });
  });

  it("ignores headings inside hidden elements", () => {
    const html = page("<template><h2>What is hidden?</h2><p>Nothing.</p></template>");
    expect(extractPage(html, PAGE_URL)).toMatchObject({ questionHeadings: 0, conciseAnswers: 0 });
  });
});
