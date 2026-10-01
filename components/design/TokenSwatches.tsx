import { SEMANTIC_TOKENS } from "@/design/token-list";

/** Every semantic token as a live swatch (re-renders correctly in each theme). */
export function TokenSwatches() {
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {SEMANTIC_TOKENS.map((token) => (
        <li key={token.name} className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="size-8 shrink-0 rounded-sm border border-line"
            style={{ background: `var(${token.name})` }}
          />
          <span>
            <code className="block font-mono text-xs">{token.name}</code>
            <span className="text-xs text-ink-muted">{token.role}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}
