import { readdirSync } from "node:fs";
import { join } from "node:path";
import { parseFile } from "@/lib/content/files";
import { ideaIdSchema } from "@/lib/content/ids";
import { contentPaths } from "@/lib/content/paths";
import { type IdeaFront, ideaFrontmatter } from "@/lib/content/schema";
import { readBoundedBytes } from "@/lib/note/bounded-read";

export const MAX_WAITING_IDEAS = 12;
const MAX_IDEA_BYTES = 32 * 1024;

export type ReadIdea = { id: string; front: IdeaFront; body: string };

/** The `.md` file names in a product's idea folder; none when the folder does not exist. */
function ideaFileNames(root: string, productId: string): string[] {
  try {
    return readdirSync(join(root, contentPaths.ideaDir(productId))).filter((n) =>
      n.endsWith(".md"),
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error; // an unreadable folder is a real problem, not "no ideas"
  }
}

/**
 * The ids of every idea file on disk, valid or not: a broken file the owner is fixing still owns
 * its name, so nothing new may be written over it.
 */
export function ideaFileIds(root: string, productId: string): Set<string> {
  return new Set(ideaFileNames(root, productId).map((n) => n.slice(0, -3)));
}

/**
 * A product's idea files, newest first, at most `limit`; files that are not valid ideas are
 * named, never hidden and never a crash. The web process only reads.
 */
export function readIdeas(
  root: string,
  productId: string,
  limit = 200,
): { ideas: ReadIdea[]; unreadable: string[] } {
  const dir = contentPaths.ideaDir(productId);
  const ideas: ReadIdea[] = [];
  const unreadable: string[] = [];
  for (const name of ideaFileNames(root, productId).sort().reverse().slice(0, limit)) {
    const path = `${dir}/${name}`;
    const id = name.slice(0, -3);
    const bytes = ideaIdSchema.safeParse(id).success
      ? readBoundedBytes(join(root, path), MAX_IDEA_BYTES)
      : null;
    const parsed = bytes === null ? null : parseFile(bytes.toString("utf8"), ideaFrontmatter);
    // A file in this folder that names another product is not this product's idea.
    if (parsed?.ok && parsed.value.productId === productId) {
      ideas.push({ id, front: parsed.value, body: parsed.body });
    } else unreadable.push(path);
  }
  ideas.sort((a, b) => b.front.created.localeCompare(a.front.created) || b.id.localeCompare(a.id));
  return { ideas, unreadable };
}

/** Ideas in `idea` state: the backlog the job and the schedule respect. */
export function countWaitingIdeas(root: string, productId: string): number {
  return readIdeas(root, productId).ideas.filter((i) => i.front.state === "idea").length;
}
