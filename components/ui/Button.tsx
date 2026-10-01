import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "ghost";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-accent text-accent-ink hover:opacity-90",
  ghost: "border border-line text-ink-muted hover:text-ink hover:bg-surface-sunk",
};

/** Harbour button. Always pass `type` explicitly inside forms. */
export function Button({
  variant = "primary",
  className = "",
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      type={type}
      className={`inline-flex items-center gap-1.5 rounded-sm px-3 py-1.5 text-sm font-medium transition-colors duration-150 disabled:opacity-50 ${VARIANTS[variant]} ${className}`}
      {...props}
    />
  );
}
