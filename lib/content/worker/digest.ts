import { z } from "zod";
import type { AgentSpec, SpecContext } from "@/lib/agents/specs";
import { renderFile } from "@/lib/content/files";
import { productIdSchema } from "@/lib/content/ids";
import { contentPaths } from "@/lib/content/paths";
import { DIGEST_PROMPT_VERSION, digestPrompt } from "@/lib/content/prompts/digest";
import { isoDaySchema } from "@/lib/format/iso-day";
import { readNeverMention } from "./never-mention";
import { requireContent } from "./run-context";
import { quotesSnippets } from "./screenpipe/overlap";
import { THEME_KINDS, validateThemes } from "./screenpipe/themes";
import { parseWorkJson, workReview } from "./work-review";

const workSchema = z.strictObject({
  themes: z
    .array(
      z.strictObject({
        productId: productIdSchema,
        text: z.string().max(400),
        kind: z.enum(THEME_KINDS),
      }),
    )
    .max(60),
});

/** The digest agent: Write only, prompt on stdin, and a run record with none of its words. */
export function digestSpec(params: Record<string, string>, context: SpecContext): AgentSpec {
  const day = isoDaySchema.parse(params.day);
  const content = requireContent(context);
  const inputs = content.digest;
  if (!inputs || inputs.day !== day) throw new Error("The digest's inputs are not available");
  const path = contentPaths.digest(day);
  const allowed = { prefixes: [], exact: [path] };
  const rules = {
    products: content.products.map((p) => ({ id: p.id, name: p.name })),
    neverMention: readNeverMention(content.root),
  };
  // Every product's text and every product's terms: an injected snippet could otherwise have the
  // agent file the same words under another product, where they would not be compared.
  const allSnippets = inputs.products.flatMap((p) => p.snippets);
  const allTerms = content.products.flatMap((p) => p.terms);
  const hadText = new Set(inputs.products.map((p) => p.productId));
  const prompt = digestPrompt({ jobId: context.jobId, digest: inputs, products: rules.products });
  return {
    kind: "content-digest",
    label: `Activity digest: ${day}`,
    prompt,
    allowed,
    targets: [contentPaths.work(context.jobId)],
    output: null,
    requiredFiles: [],
    requiredOutputs: [path],
    promptVersion: DIGEST_PROMPT_VERSION,
    tools: ["Write"],
    stdin: true,
    quiet: true,
    noQuarantine: true,
    quietFailure: "The digest agent didn't finish.",
    review: workReview({
      jobId: context.jobId,
      prompt,
      allowed,
      plan: {
        parse: (text) => parseWorkJson(text, workSchema),
        files: (value, note) => {
          const valid = validateThemes(value.themes, rules);
          // A theme that repeats the screen text word for word is the snippet, not a summary.
          // A product with no on-topic text has nothing to summarise: its themes are invented.
          const themes = valid.themes
            .filter(
              (t) => hadText.has(t.productId) && !quotesSnippets(t.text, allSnippets, allTerms),
            )
            .map((t, i) => ({ ...t, id: `t${i + 1}` }));
          const dropped = value.themes.length - themes.length;
          for (const product of rules.products) {
            const raw = value.themes.filter((t) => t.productId === product.id).length;
            const kept = themes.filter((t) => t.productId === product.id).length;
            if (raw > 0) {
              note(
                `${kept} theme(s) for ${product.name}${raw > kept ? `, ${raw - kept} dropped by the privacy check` : ""}`,
              );
            }
          }
          const front = {
            title: `Activity themes ${day}`,
            kind: "content-digest",
            date: day,
            window: {
              start: inputs.window.start.toISOString(),
              end: inputs.window.end.toISOString(),
            },
            status: dropped > 0 ? "partial" : "ok",
            themes,
          };
          const body = themes.map((t) => `- ${t.text}`).join("\n");
          return { [path]: renderFile(front, body === "" ? "No themes today." : body) };
        },
      },
    }),
  };
}
