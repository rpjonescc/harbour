export type NavItem = {
  label: string;
  href: string;
  badge?: "brain-new" | "actions-open" | "content-ready";
};

/** Primary navigation; a badge names the count the sidebar shows next to the item. */
export const NAV_ITEMS: NavItem[] = [
  { label: "Today", href: "/" },
  { label: "Actions", href: "/actions", badge: "actions-open" },
  { label: "Content", href: "/content", badge: "content-ready" },
  { label: "Second Brain", href: "/brain", badge: "brain-new" },
  { label: "Agents", href: "/agents" },
  { label: "Sources", href: "/settings/sources" },
  { label: "Devices", href: "/settings/devices" },
  { label: "Settings", href: "/settings" },
  { label: "Design system", href: "/design" },
];

/**
 * The one href of `hrefs` that is current on `pathname`: an exact match, else the longest href
 * that prefixes the path at a `/` boundary ("/" only ever matches exactly); null for none.
 */
export function activeNavHref(pathname: string, hrefs: readonly string[]): string | null {
  if (hrefs.includes(pathname)) return pathname;
  const prefixes = hrefs.filter((href) => href !== "/" && pathname.startsWith(`${href}/`));
  return prefixes.reduce<string | null>(
    (longest, href) => (longest === null || href.length > longest.length ? href : longest),
    null,
  );
}
