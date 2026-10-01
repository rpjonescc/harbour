import { discoveryPrompt, PROMPT_VERSION, researchPrompt } from "./prompts";
import { RESEARCH_TOPICS } from "./topics";

const products = [
  { id: "acme-docs", name: "Acme Docs", url: "https://docs.example.com", hue: "amber" as const },
];
const product = products[0];
const topic = RESEARCH_TOPICS.find((t) => t.id === "how-ai-engines-pick-sources");
if (!product || !topic) throw new Error("expected fixtures");

describe("researchPrompt", () => {
  const prompt = researchPrompt(topic, products, "2026-10-01");

  it("names exactly one target file and the date", () => {
    expect(prompt).toMatch(/^TARGET_FILES: research\/geo\/how-ai-engines-pick-sources\.md$/m);
    expect(prompt).toContain("2026-10-01");
  });
  it("requires citations, frontmatter and a products section", () => {
    expect(prompt).toMatch(/cite/i);
    expect(prompt).toContain("review_by: 2026-12-30");
    expect(prompt).toContain("What this means for our products");
    expect(prompt).toContain("Acme Docs (https://docs.example.com)");
    expect(prompt).toContain("products/acme-docs/notes.md");
  });
  it("forbids writing anything else", () => {
    expect(prompt).toMatch(/do not create, edit or delete any other file/i);
  });
  it("is versioned", () => {
    expect(PROMPT_VERSION).toBe("2b-v1");
  });
});

describe("discoveryPrompt", () => {
  const prompt = discoveryPrompt(product, "2026-10-01");
  it("targets the product's discovery files and specifies the proposals schema", () => {
    expect(prompt).toMatch(
      /^TARGET_FILES: products\/acme-docs\/discovery\.md, products\/acme-docs\/proposals\.json$/m,
    );
    expect(prompt).toContain('"keywords"');
    expect(prompt).toContain('"questions"');
    expect(prompt).toContain('"competitors"');
    expect(prompt).toContain("products/acme-docs/notes.md");
  });
});
