export type NavItem = { label: string; href: string; badge?: "brain-new" | "actions-open" };

/** Primary navigation; a badge names the count the sidebar shows next to the item. */
export const NAV_ITEMS: NavItem[] = [
  { label: "Today", href: "/" },
  { label: "Actions", href: "/actions", badge: "actions-open" },
  { label: "Second Brain", href: "/brain", badge: "brain-new" },
  { label: "Agents", href: "/agents" },
  { label: "Sources", href: "/settings/sources" },
  { label: "Devices", href: "/settings/devices" },
  { label: "Design system", href: "/design" },
];
