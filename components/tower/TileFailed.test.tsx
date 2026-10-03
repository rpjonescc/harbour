// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { TILE_FAILED } from "@/lib/explain/tower";
import { TileFailed } from "./TileFailed";

describe("TileFailed", () => {
  it("says the plain failure sentence and keeps the error behind Technical details", () => {
    render(<TileFailed tile="Your products" detail="SqliteError: database is locked" />);
    expect(screen.getByText(TILE_FAILED)).toBeVisible();
    const error = screen.getByText("SqliteError: database is locked");
    expect(error).not.toBeVisible();
    fireEvent.click(screen.getByText(/Technical details/));
    expect(error).toBeVisible();
    expect(screen.getByText("(Your products)")).toBeInTheDocument();
  });
});
