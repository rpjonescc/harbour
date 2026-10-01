export type NavItem = { label: string; href?: string; soon?: boolean };

/** Primary navigation. Items marked `soon` render disabled until their phase ships. */
export const NAV_ITEMS: NavItem[] = [
  { label: "Today", href: "/" },
  { label: "Actions", soon: true },
  { label: "Second Brain", soon: true },
  { label: "Agents", soon: true },
  { label: "Devices", href: "/settings/devices" },
  { label: "Design system", href: "/design" },
];
