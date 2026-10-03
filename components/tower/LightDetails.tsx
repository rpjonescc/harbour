"use client";

import Link from "next/link";
import { type KeyboardEvent, useId, useRef, useState } from "react";
import { Term } from "@/components/explain/Term";
import { LIGHT_LABELS, type LightId, TONE_WORDS } from "@/lib/explain/tower";
import { LIGHT_TERMS, SYSTEMS_TEXT } from "@/lib/explain/tower-tiles";
import type { Light } from "@/lib/tower/system";
import { TILE_LINK } from "./link-styles";
import { StatusLight } from "./StatusLight";

const NEEDS_A_LOOK = new Set<Light["tone"]>(["act", "watch", "unknown"]);

/** True while focus sits on a term whose tip is open: Escape then belongs to the tip. */
function tipOpen(target: EventTarget): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tipId = target.getAttribute("aria-describedby");
  const tip = tipId ? document.getElementById(tipId) : null;
  return tip?.getAttribute("role") === "tooltip" && !tip.hidden;
}

function Panel({ light }: { light: Light }) {
  const label = LIGHT_LABELS[light.id];
  const term = LIGHT_TERMS[light.id];
  const link = NEEDS_A_LOOK.has(light.tone) ? SYSTEMS_TEXT.fix : SYSTEMS_TEXT.open;
  return (
    <>
      <p className="font-medium text-ink">{term ? <Term id={term}>{label}</Term> : label}</p>
      <p className="text-ink">{light.sentence}</p>
      {light.href && (
        <p>
          <Link
            href={light.href}
            aria-label={SYSTEMS_TEXT.linkName(link, label)}
            className={`${TILE_LINK} inline-flex min-h-11 items-center`}
          >
            {link}
          </Link>
        </p>
      )}
    </>
  );
}

/**
 * The eight lights as a row of disclosure buttons (4 × 2 on a phone) and one panel under them
 * for the open light: its word explained, its sentence and where to act. One light at a time.
 */
export function LightDetails({ lights }: { lights: readonly Light[] }) {
  const [openId, setOpenId] = useState<LightId | null>(null);
  const panelId = useId();
  const buttons = useRef(new Map<LightId, HTMLButtonElement>());
  const open = lights.find((l) => l.id === openId) ?? null;

  function onKeyDown(event: KeyboardEvent) {
    if (event.key !== "Escape" || openId === null || tipOpen(event.target)) return;
    setOpenId(null);
    buttons.current.get(openId)?.focus();
  }

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: Escape from anywhere inside closes the open light
    <div className="flex flex-col gap-3" onKeyDown={onKeyDown}>
      <ul className="grid grid-cols-4 gap-1 md:grid-cols-8">
        {lights.map((light) => {
          const label = LIGHT_LABELS[light.id];
          const expanded = openId === light.id;
          return (
            <li key={light.id}>
              <button
                type="button"
                ref={(el) => {
                  if (el) buttons.current.set(light.id, el);
                  else buttons.current.delete(light.id);
                }}
                aria-expanded={expanded}
                aria-controls={panelId}
                aria-label={SYSTEMS_TEXT.lightName(label, TONE_WORDS[light.tone])}
                onClick={() => setOpenId(expanded ? null : light.id)}
                className="flex min-h-11 w-full justify-center rounded-md px-1 py-2 hover:bg-surface-sunk aria-expanded:bg-surface-sunk"
              >
                <StatusLight tone={light.tone} label={label} />
              </button>
            </li>
          );
        })}
      </ul>
      <div
        id={panelId}
        hidden={open === null}
        className="flex flex-col gap-1 rounded-md bg-surface-sunk p-3 text-sm"
      >
        {open && <Panel light={open} />}
      </div>
    </div>
  );
}
