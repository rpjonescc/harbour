// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { CopyButton } from "./CopyButton";

it("copies exactly the clean text it was given and says so, then says when the clipboard refuses", async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.assign(navigator, { clipboard: { writeText } });
  render(<CopyButton label="Post 2" text="Second post. #docs" />);
  fireEvent.click(screen.getByRole("button", { name: "Copy Post 2" }));
  await screen.findByText("Copied");
  expect(writeText).toHaveBeenCalledWith("Second post. #docs");
  writeText.mockRejectedValueOnce(new Error("denied"));
  fireEvent.click(screen.getByRole("button", { name: "Copy Post 2" }));
  await screen.findByText(/Couldn't copy/);
});
