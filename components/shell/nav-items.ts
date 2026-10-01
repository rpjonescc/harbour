export type NavItem = { label: string; href?: string; soon?: boolean; badge?: "brain-new" };

/** Primary navigation. Items marked `soon` render disabled until their phase ships. */
export const NAV_ITEMS: NavItem[] = [
  { label: "Today", href: "/" },
  { label: "Actions", soon: true },
  { label: "Second Brain", href: "/brain", badge: "brain-new" },
  { label: "Agents", href: "/agents" },
  { label: "Devices", href: "/settings/devices" },
  { label: "Design system", href: "/design" },
];
