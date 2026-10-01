// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { CopyPromptButton } from "./CopyPromptButton";

const writeText = vi.fn();
const PROMPT = "Fix an SEO issue on Acme Docs (https://docs.example.com)…";

function renderButton() {
  render(<CopyPromptButton prompt={PROMPT} issueTitle="2 pages have no title" />);
  return screen.getByRole("button", { name: "Hand to Claude: 2 pages have no title" });
}

describe("CopyPromptButton", () => {
  beforeEach(() => {
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
  });
  afterEach(() => vi.resetAllMocks());

  it("copies the prompt and confirms it visibly", async () => {
    writeText.mockResolvedValue(undefined);
    fireEvent.click(renderButton());
    expect(await screen.findByText("Copied — paste it into Claude")).toBeInTheDocument();
    expect(writeText).toHaveBeenCalledWith(PROMPT);
  });

  it("shows the prompt to copy by hand when the clipboard is refused", async () => {
    writeText.mockRejectedValue(new Error("denied"));
    fireEvent.click(renderButton());
    const box = await screen.findByRole("textbox", { name: "Prompt for Claude" });
    expect(box).toHaveValue(PROMPT);
    expect(screen.getByText(/Couldn't copy/)).toBeInTheDocument();
  });
});
