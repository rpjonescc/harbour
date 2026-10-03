import { count, type PageVerdict } from "./page-verdict";
import type { TermLine } from "./term-line";

/** The Devices page's line under its title, naming who the devices sign in as. */
export function devicesIntro(login: string): TermLine {
  return [
    `The devices that can open Harbour as ${login}. Each signs in with a `,
    { term: "passkey", text: "passkey" },
    ": your fingerprint, face or screen lock.",
  ];
}

/** The Devices page's verdict: how many devices can sign in, and a nudge when only one can. */
export function devicesVerdict(devices: readonly { current: boolean }[]): PageVerdict {
  const total = devices.length;
  if (total === 0) {
    return { tone: "unknown", text: "No device is listed yet. Add one to sign in with a passkey." };
  }
  if (total === 1) {
    return {
      tone: "ok",
      text: "1 device can open Harbour. Add a second one so you can still get in if you lose it.",
    };
  }
  const here = devices.some((device) => device.current) ? ", including this one" : "";
  return { tone: "ok", text: `${count(total, "device")} can open Harbour${here}.` };
}
