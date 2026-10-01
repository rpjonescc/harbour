// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

let pathname = "/";
vi.mock("next/navigation", () => ({ usePathname: () => pathname }));

import { NavLink } from "./NavLink";

afterEach(cleanup);

describe("NavLink", () => {
  it.each(["/design", "/design/x"])("is current on %s", (path) => {
    pathname = path;
    render(<NavLink href="/design">Design</NavLink>);
    expect(screen.getByRole("link").getAttribute("aria-current")).toBe("page");
  });

  it("is not current on a sibling path like /designs", () => {
    pathname = "/designs";
    render(<NavLink href="/design">Design</NavLink>);
    expect(screen.getByRole("link").getAttribute("aria-current")).toBeNull();
  });
});

describe("NavLink among siblings", () => {
  const HREFS = ["/settings/sources", "/settings/devices", "/settings"];

  it("is not current when a longer sibling href matches", () => {
    pathname = "/settings/devices";
    render(
      <NavLink href="/settings" hrefs={HREFS}>
        Settings
      </NavLink>,
    );
    expect(screen.getByRole("link").getAttribute("aria-current")).toBeNull();
  });

  it("is current on its own sub-pages no sibling claims", () => {
    pathname = "/settings/products/acme-docs";
    render(
      <NavLink href="/settings" hrefs={HREFS}>
        Settings
      </NavLink>,
    );
    expect(screen.getByRole("link").getAttribute("aria-current")).toBe("page");
  });
});

describe("NavLink badge", () => {
  it("shows a count with an accessible label", () => {
    render(
      <NavLink href="/brain" badge={{ count: 3, label: "3 new documents" }}>
        Second Brain
      </NavLink>,
    );
    const link = screen.getByRole("link", { name: /Second Brain/ });
    expect(link).toHaveTextContent("3");
    expect(screen.getByText("3 new documents")).toHaveClass("sr-only");
  });

  it("hides the badge at zero", () => {
    render(
      <NavLink href="/brain" badge={{ count: 0, label: "0 new documents" }}>
        Second Brain
      </NavLink>,
    );
    expect(screen.queryByText("0 new documents")).not.toBeInTheDocument();
  });
});
