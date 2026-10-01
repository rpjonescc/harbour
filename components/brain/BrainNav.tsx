"use client";

import { ChevronDown } from "lucide-react";
import { usePathname } from "next/navigation";
import { type ReactNode, useId, useState } from "react";

/**
 * One document tree for every screen size: a toggled panel on small screens (closing again
 * after navigation) and an always-visible sidebar on large ones.
 */
export function BrainNav({
  label = "Documents",
  children,
}: {
  label?: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === pathname;
  const panelId = useId();
  return (
    <div className="rounded-md border border-line bg-surface p-3 lg:border-0 lg:bg-transparent lg:p-0">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpenOn(open ? null : pathname)}
        className="flex w-full items-center justify-between rounded-sm text-sm font-medium lg:hidden"
      >
        Browse documents
        <ChevronDown aria-hidden="true" className={`size-4 ${open ? "rotate-180" : ""}`} />
      </button>
      <nav
        id={panelId}
        aria-label={label}
        className={`${open ? "mt-2 block" : "hidden"} lg:mt-0 lg:block`}
      >
        {children}
      </nav>
    </div>
  );
}
