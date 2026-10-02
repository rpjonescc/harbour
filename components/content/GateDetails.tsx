import Link from "next/link";
import { brainHref } from "@/lib/brain/wikilinks";
import type { PieceView } from "@/lib/content/read/view-types";

const NAMES = {
  "no-ai-slop": "Writing check: no-ai-slop",
  humanizer: "Writing check: humanizer",
  facts: "Facts and claims",
  platform: "Platform check",
} as const;

/** Each gate's result in run order, its findings and claims, the skills used, and the file link. */
export function GateDetails({ piece }: { piece: PieceView }) {
  return (
    <div className="flex flex-col gap-3 text-xs text-ink-muted">
      {piece.gates.length === 0 && <p>No checks have run on this piece yet.</p>}
      <ol className="flex flex-col gap-2">
        {piece.gates.map((g) => (
          <li key={`${g.gate}-${g.attempt}-${g.jobId}`}>
            <p className="text-ink">
              {NAMES[g.gate]}, try {g.attempt}: {g.result}
              {g.revisedAfter ? ` (after ${g.revisedAfter.join(" and ")})` : ""}
            </p>
            {g.instructions && (
              <p>
                Skill {g.instructions.name}: {g.instructions.source} (hash{" "}
                {g.instructions.sha256.slice(0, 12)})
              </p>
            )}
            <ul className="list-disc pl-4">
              {g.findings.map((f) => (
                <li key={`${f.pattern}-${f.quote}`}>
                  {f.pattern}: {f.quote ? <q>{f.quote}</q> : null} Fix: {f.fix}
                </li>
              ))}
              {g.questions.map((q) => (
                <li key={q}>Question: {q}</li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
      {piece.claims.length > 0 && (
        <table className="w-full text-left">
          <caption className="sr-only">Claims and where they come from</caption>
          <thead>
            <tr>
              <th scope="col">Claim</th>
              <th scope="col">Comes from</th>
              <th scope="col">Flag</th>
            </tr>
          </thead>
          <tbody>
            {piece.claims.map((c) => (
              <tr key={`${c.text}-${c.trace}`}>
                <td>{c.text}</td>
                <td>{c.trace}</td>
                <td>{c.flag ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p>
        <Link
          href={brainHref(piece.file)}
          className="rounded-sm text-accent underline underline-offset-2"
        >
          Open in the Second Brain
        </Link>
      </p>
    </div>
  );
}
