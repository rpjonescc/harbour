import { type LightTone, TONE_WORDS } from "@/lib/explain/tower";

/** Each tone's colour, from semantic tokens only; the shape and the words carry the meaning. */
const COLOUR: Readonly<Record<LightTone, string>> = {
  ok: "text-good",
  busy: "text-accent",
  ready: "text-accent",
  watch: "text-warn",
  act: "text-bad",
  off: "text-ink-muted",
  unknown: "text-ink-muted",
};

const INNER = {
  fill: "none",
  strokeWidth: 1.8,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

/**
 * The shape for each tone (spec §4.3): tick, breathing ring, star (ready for you), triangle,
 * diamond "!", hollow, "?".
 */
function Shape({ tone }: { tone: LightTone }) {
  switch (tone) {
    case "ok":
      return (
        <>
          <circle cx="8" cy="8" r="7" className="fill-current" />
          <path d="M4.8 8.3l2.1 2.1 4.3-4.6" className="stroke-surface" {...INNER} />
        </>
      );
    case "busy":
      return (
        <>
          <circle
            cx="8"
            cy="8"
            r="7"
            className="tower-breathe fill-none stroke-current"
            strokeWidth="1.5"
          />
          <circle cx="8" cy="8" r="4" className="fill-current" />
        </>
      );
    case "ready":
      return (
        <path
          d="M8 .7l1.76 4.87 5.18.17-4.09 3.19 1.44 4.98L8 11l-4.29 2.91 1.44-4.98-4.09-3.19 5.18-.17z"
          className="fill-current"
          strokeLinejoin="round"
        />
      );
    case "watch":
      return <path d="M8 1.5L15 14.5H1z" className="fill-current" strokeLinejoin="round" />;
    case "act":
      return (
        <>
          <path d="M8 .7L15.3 8 8 15.3.7 8z" className="fill-current" />
          <path d="M8 4.6v4" className="stroke-surface" {...INNER} />
          <circle cx="8" cy="11.3" r="1" className="fill-surface" />
        </>
      );
    case "off":
      return (
        <circle cx="8" cy="8" r="6.2" className="fill-none stroke-current" strokeWidth="1.5" />
      );
    case "unknown":
      return (
        <>
          <circle
            cx="8"
            cy="8"
            r="6.2"
            className="fill-none stroke-current"
            strokeWidth="1.5"
            strokeDasharray="2.4 2"
          />
          <path
            d="M6.3 6.4a1.8 1.8 0 1 1 2.5 1.7c-.5.2-.8.6-.8 1.1v.3"
            className="stroke-current"
            {...INNER}
            strokeWidth="1.4"
          />
          <circle cx="8" cy="11.4" r=".9" className="fill-current" />
        </>
      );
  }
}

/** A tone's mark alone. Decorative: words beside it always say the same thing. */
export function LightMark({ tone }: { tone: LightTone }) {
  return (
    <svg
      aria-hidden="true"
      data-tone={tone}
      viewBox="0 0 16 16"
      className={`size-4 shrink-0 overflow-visible ${COLOUR[tone]}`}
    >
      <Shape tone={tone} />
    </svg>
  );
}

type Props = {
  tone: LightTone;
  label: string;
  /** One line, mark and label only (the label already says the tone, e.g. "Checked 3 h ago."). */
  compact?: boolean;
};

/** A status light: a mark plus words, never colour alone ("Worker" over "needs you"). */
export function StatusLight({ tone, label, compact = false }: Props) {
  if (compact) {
    return (
      <span className="inline-flex items-start gap-1.5">
        <span className="flex h-5 items-center">
          <LightMark tone={tone} />
        </span>
        <span>{label}</span>
      </span>
    );
  }
  return (
    <span className="flex flex-col items-center gap-1 text-center">
      <LightMark tone={tone} />
      <span className="text-xs font-medium text-ink">{label}</span>{" "}
      <span className="text-2xs text-ink-muted">{TONE_WORDS[tone]}</span>
    </span>
  );
}
