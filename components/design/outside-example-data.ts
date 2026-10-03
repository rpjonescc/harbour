import type { OutsideView } from "@/lib/scan/outside-view";

const CHECK: OutsideView["check"] = { active: null, refusal: null };
const AT = "2026-10-04T06:00:00.000Z";

const READY: OutsideView = {
  state: "ready",
  notice: null,
  checkedAt: AT,
  links: { count: 4, change: 1, checkedAt: AT },
  searches: [
    {
      query: "acme docs",
      checked: true,
      position: 3,
      url: "https://docs.example.com/guide",
      checkedAt: AT,
      change: "up",
      before: { position: 5 },
    },
    {
      query: "best documentation tools for small teams",
      checked: true,
      position: null,
      url: null,
      checkedAt: AT,
      change: "same",
      before: { position: null },
    },
    {
      query: "docs for remote teams",
      checked: true,
      position: 12,
      url: "https://docs.example.com/remote",
      checkedAt: AT,
      change: "down",
      before: { position: null },
    },
    {
      query: "team handbook software",
      checked: true,
      position: 7,
      url: "https://docs.example.com/handbook",
      checkedAt: AT,
      change: "first",
      before: null,
    },
    {
      query: "documentation hosting",
      checked: false,
      position: null,
      url: null,
      checkedAt: null,
      change: null,
      before: null,
    },
  ],
  ai: {
    asked: 5,
    named: 1,
    cited: 0,
    domains: ["news.example.org", "reviews.example.net"],
    checkedAt: AT,
  },
  check: CHECK,
};

const NOTHING = { checkedAt: null, links: null, searches: [], ai: null, check: CHECK };

/** Every state of the "How the web sees you" section, for /design and the component tests. */
export const OUTSIDE_STATES: { label: string; view: OutsideView }[] = [
  { label: "Checked", view: READY },
  { label: "Paused after a refused key", view: { ...READY, notice: "paused_key" } },
  { label: "Paused: balance empty", view: { ...READY, notice: "paused_balance" } },
  { label: "Skipped: budget used up", view: { ...READY, notice: "budget" } },
  { label: "The last check didn't work", view: { ...READY, notice: "failed" } },
  {
    label: "A check is running",
    view: { ...READY, check: { active: "running", refusal: null } },
  },
  {
    label: "Too soon for another check",
    view: { ...READY, check: { active: null, refusal: "too_soon" } },
  },
  { label: "No searches chosen", view: { ...NOTHING, state: "no_searches", notice: null } },
  { label: "Treg isn't connected", view: { ...NOTHING, state: "not_connected", notice: null } },
  { label: "Not checked yet", view: { ...NOTHING, state: "not_checked", notice: null } },
  { label: "Not checked: paused", view: { ...NOTHING, state: "not_checked", notice: "paused" } },
  {
    label: "Not checked: budget used up",
    view: { ...NOTHING, state: "not_checked", notice: "budget" },
  },
];

export const OUTSIDE_READY = READY;
export const OUTSIDE_NOT_CHECKED: OutsideView = { ...NOTHING, state: "not_checked", notice: null };
