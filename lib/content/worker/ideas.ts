import { lstatSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import type { AgentSpec, SpecContext } from "@/lib/agents/specs";
import { renderFile } from "@/lib/content/files";
import { makeIdeaId, productIdSchema } from "@/lib/content/ids";
import { contentPaths } from "@/lib/content/paths";
import { IDEAS_PROMPT_VERSION, ideasPrompt } from "@/lib/content/prompts/ideas";
import { MAX_WAITING_IDEAS, TooManyIdeaFilesError } from "@/lib/content/read/ideas";
import { readVoice } from "@/lib/content/read/voice";
import { sanitiseText } from "@/lib/content/sanitise";
import { refSchema } from "@/lib/content/schema";
import {
  IDEA_FILE_IN_THE_WAY,
  notesMissingMessage,
  voiceInvalidMessage,
  voiceMissingMessage,
} from "@/lib/explain/content";
import { gatherIdeasInputs, IdeasInputError, type IdeasInputs } from "./ideas-inputs";
import { requireContent } from "./run-context";
import { parseWorkJson, workReview } from "./work-review";

const text = (max: number) => z.string().trim().min(1).max(max);
const ideaSchema = z.strictObject({
  title: text(90),
  pillar: z.string().max(60).nullable(),
  angle: text(240),
  audienceQuestion: text(160),
  why: text(240),
  sources: z.array(refSchema).min(1).max(8),
});
const workSchema = z.strictObject({ ideas: z.array(ideaSchema).min(1).max(5) });
type Work = z.infer<typeof workSchema>;
type Idea = Work["ideas"][number];

// Markdown the social sanitiser lets through, and emoji: ideas are plain sentences.
const NOT_PLAIN = /[<>\n*`[\]]|https?:|www\.|^#|~~|\p{Extended_Pictographic}/u;

/** Plain text: nothing the sanitiser would strip or reject, no markup, links or emoji. */
function isPlain(value: string): boolean {
  const clean = sanitiseText(value, "social");
  return clean.ok && !clean.stripped && !NOT_PLAIN.test(value);
}

const normalTitle = (title: string) => title.toLowerCase().replace(/\s+/g, " ").trim();

/** Why this output cannot be written, in fixed words the agent can act on; null when it can. */
function problem(work: Work, inputs: IdeasInputs, day: string): string | null {
  const known = new Set([
    `product:${inputs.product.id}`,
    ...inputs.themes.map((t) => t.ref),
    ...inputs.notes.map((n) => n.ref),
    ...inputs.pillars.map((p) => `pillar:${p.key}`),
  ]);
  const keys = new Set(inputs.pillars.map((p) => p.key));
  const seen = new Set<string>();
  for (const [i, idea] of work.ideas.entries()) {
    const n = i + 1;
    if (idea.sources.some((s) => !known.has(s)))
      return `Idea ${n} cites a source that does not exist.`;
    if (idea.pillar !== null && !keys.has(idea.pillar))
      return `Idea ${n} names a pillar that is not approved.`;
    if (![idea.title, idea.angle, idea.audienceQuestion, idea.why].every(isPlain)) {
      return `Idea ${n} has text that is not plain.`;
    }
    const id = makeIdeaId(inputs.product.id, day, idea.title);
    if (seen.has(id)) return `Idea ${n} repeats an earlier idea in your list.`;
    seen.add(id);
  }
  return fresh(work.ideas, inputs, day).length > 0
    ? null
    : "Every idea you proposed already exists. Propose different ones.";
}

/** The ideas worth writing: not already a file, not a title the owner has, and within the backlog room. */
function fresh(ideas: Idea[], inputs: IdeasInputs, day: string): Idea[] {
  const titles = new Set(inputs.recentTitles.map(normalTitle));
  const isNew = (idea: Idea) =>
    !inputs.existingIds.has(makeIdeaId(inputs.product.id, day, idea.title)) &&
    !titles.has(normalTitle(idea.title));
  return ideas.filter(isNew).slice(0, Math.max(0, MAX_WAITING_IDEAS - inputs.waiting));
}

const exists = (root: string, path: string): boolean => {
  try {
    lstatSync(join(root, path)); // lstat: a dangling symlink still owns the name
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    // The system's own message holds a path; the owner gets a sentence instead.
    throw new Error(IDEA_FILE_IN_THE_WAY);
  }
};

/** Why the ideas run cannot start, as a plain sentence the owner can act on (never agent text). */
function startProblem(content: ReturnType<typeof requireContent>, productId: unknown) {
  const id = productIdSchema.safeParse(productId);
  const product = id.success ? content.products.find((p) => p.id === id.data) : undefined;
  if (!product) return { error: "This product is not set up for content." } as const;
  const voice = readVoice(content.root, product.id);
  if (voice.state === "missing") {
    return { error: voiceMissingMessage(product.name) } as const;
  }
  if (voice.state === "invalid") {
    return { error: voiceInvalidMessage(product.name, voice.reason) } as const;
  }
  return { product, voice: voice.profile } as const;
}

/** The ideas agent: Write only, inputs in the prompt, and ids and frontmatter made by the worker. */
export function ideasSpec(params: Record<string, string>, context: SpecContext): AgentSpec {
  const content = requireContent(context);
  const start = startProblem(content, params.productId);
  if ("error" in start) throw new Error(start.error);
  const { product, voice } = start;
  let inputs: IdeasInputs;
  try {
    inputs = gatherIdeasInputs(
      content.root,
      product,
      content.approvedPillars(product.id),
      context.today,
    );
  } catch (error) {
    if (error instanceof IdeasInputError || error instanceof TooManyIdeaFilesError) {
      throw new Error(error.message);
    }
    // Only the errno code is logged: a path or file name has no place in a log line.
    console.error(
      `ideas: could not read the brain (${(error as NodeJS.ErrnoException).code ?? "unknown"})`,
    );
    throw new Error(
      "Harbour couldn't read the files it needs for ideas. Check the brain folder, then try again.",
    );
  }
  if (inputs.waiting >= MAX_WAITING_IDEAS)
    throw new Error(`${MAX_WAITING_IDEAS} ideas are waiting; skipped`);
  const prompt = ideasPrompt({ jobId: context.jobId, inputs, voice });
  const allowed = { prefixes: [], exact: [] as string[] };
  return {
    kind: "content-ideas",
    label: `Ideas: ${product.name}`,
    prompt,
    allowed,
    targets: [contentPaths.work(context.jobId)],
    output: null,
    requiredFiles: [`products/${product.id}/notes.md`],
    missingFileMessage: notesMissingMessage(product.name, product.id),
    requiredOutputs: [],
    promptVersion: IDEAS_PROMPT_VERSION,
    tools: ["Write"],
    stdin: true,
    // The agent's own words (which can quote its inputs) stay out of the run record.
    quiet: true,
    quietFailure: "The ideas agent didn't finish.",
    review: workReview({
      jobId: context.jobId,
      prompt,
      allowed,
      plan: {
        createOnly: { inTheWay: IDEA_FILE_IN_THE_WAY },
        parse: (raw) => {
          const parsed = parseWorkJson(raw, workSchema);
          if (!parsed.ok) return parsed;
          const reason = problem(parsed.value, inputs, context.today);
          return reason ? { ok: false, reason } : parsed;
        },
        files: (work, note) => {
          const files: Record<string, string> = {};
          for (const idea of fresh(work.ideas, inputs, context.today)) {
            const id = makeIdeaId(product.id, context.today, idea.title);
            const path = contentPaths.idea(product.id, id);
            if (exists(content.root, path)) continue; // never overwrite an idea the owner may have edited
            files[path] = renderFile(
              {
                title: idea.title,
                kind: "content-idea",
                productId: product.id,
                state: "idea",
                pillar: idea.pillar,
                angle: idea.angle,
                audienceQuestion: idea.audienceQuestion,
                why: idea.why,
                sources: [...new Set(idea.sources)],
                needsYou: null,
                created: context.today,
                createdBy: `job-${context.jobId}`,
              },
              `Why: ${idea.why}\n\nAngle: ${idea.angle}\n\nAudience question: ${idea.audienceQuestion}`,
            );
          }
          note(`${Object.keys(files).length} new idea(s) for ${product.name}`);
          return files;
        },
      },
    }),
  };
}
