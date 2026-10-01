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
