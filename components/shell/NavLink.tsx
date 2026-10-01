"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const BASE = "flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm";

/** Sidebar link with active state and an optional count badge. */
export function NavLink({
  href,
  badge,
  children,
}: {
  href: string;
  badge?: { count: number; label: string };
  children: ReactNode;
}) {
  const pathname = usePathname();
  const active =
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`${BASE} ${active ? "bg-surface text-ink shadow-[var(--shadow-hairline)]" : "text-ink-muted hover:text-ink"}`}
    >
      {children}
      {badge && badge.count > 0 && (
        <span className="ml-auto rounded-full bg-accent-soft px-1.5 text-2xs text-accent">
          <span aria-hidden="true">{badge.count}</span>
          <span className="sr-only">{badge.label}</span>
        </span>
      )}
    </Link>
  );
}
