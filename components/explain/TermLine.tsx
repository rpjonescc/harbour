import { Fragment } from "react";
import type { TermLine as Line } from "@/lib/explain/term-line";
import { Term } from "./Term";

/** A sentence from lib/explain whose glossary words open their meaning on hover, focus or tap. */
export function TermLine({ line }: { line: Line }) {
  return (
    <>
      {line.map((part, index) =>
        typeof part === "string" ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: the parts are fixed text, never reordered.
          <Fragment key={index}>{part}</Fragment>
        ) : (
          // biome-ignore lint/suspicious/noArrayIndexKey: the parts are fixed text, never reordered.
          <Term key={index} id={part.term}>
            {part.text}
          </Term>
        ),
      )}
    </>
  );
}
