// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import type { ProposalRow } from "@/lib/agents/proposals";
import { ProposalList } from "./ProposalList";

const nav = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
const api = vi.hoisted(() => ({ postJson: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => nav }));
vi.mock("@/lib/auth/client-api", () => api);

const row = (over: Partial<ProposalRow>): ProposalRow => ({
  id: 1,
  productId: "acme-docs",
  type: "keyword",
  value: { term: "example widgets", intent: "commercial" },
  key: "k",
  why: "Buyers search this",
  status: "proposed",
  edited: false,
  sourceJobId: null,
  createdAt: new Date(0),
  decidedAt: null,
  ...over,
});

const renderList = (items: ProposalRow[]) =>
  render(
    <ProposalList type="keyword" productId="acme-docs" productName="Acme Docs" items={items} />,
  );
const URL_ = "/api/products/acme-docs/proposals";

describe("ProposalList", () => {
  afterEach(() => vi.resetAllMocks());

  it("renders term, intent, why and status", () => {
    renderList([row({})]);
    expect(screen.getByText("example widgets")).toBeInTheDocument();
    expect(screen.getByText("commercial")).toBeInTheDocument();
    expect(screen.getByText("Buyers search this")).toBeInTheDocument();
    expect(screen.getByText("proposed", { selector: "span" })).toBeInTheDocument();
  });

  it("shows the empty state", () => {
    renderList([]);
    expect(screen.getByText(/No proposals yet/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Agents page" })).toHaveAttribute("href", "/agents");
  });

  it("approves one item", async () => {
    api.postJson.mockResolvedValue({ ok: true, data: { ok: true } });
    renderList([row({ id: 7 })]);
    fireEvent.click(screen.getByRole("button", { name: 'Approve keyword "example widgets"' }));
    await vi.waitFor(() =>
      expect(api.postJson).toHaveBeenCalledWith(URL_, { action: "approve", proposalId: 7 }),
    );
    await vi.waitFor(() => expect(nav.refresh).toHaveBeenCalled());
  });

  it("approves all proposed", async () => {
    api.postJson.mockResolvedValue({ ok: true, data: { ok: true, count: 1 } });
    renderList([row({})]);
    fireEvent.click(screen.getByRole("button", { name: "Approve all proposed" }));
    await vi.waitFor(() =>
      expect(api.postJson).toHaveBeenCalledWith(URL_, { action: "approve-all", type: "keyword" }),
    );
  });

  it("hides approve-all when nothing is proposed", () => {
    renderList([row({ status: "approved" })]);
    expect(screen.queryByRole("button", { name: "Approve all proposed" })).toBeNull();
  });

  it("saves an edit, omitting an empty location", async () => {
    api.postJson.mockResolvedValue({ ok: true, data: { ok: true } });
    renderList([row({ id: 3 })]);
    fireEvent.click(screen.getByRole("button", { name: 'Edit keyword "example widgets"' }));
    fireEvent.change(screen.getByLabelText("Term"), { target: { value: "example gadgets" } });
    fireEvent.click(screen.getByRole("button", { name: 'Save keyword "example widgets"' }));
    await vi.waitFor(() =>
      expect(api.postJson).toHaveBeenCalledWith(URL_, {
        action: "edit",
        proposalId: 3,
        value: { term: "example gadgets", intent: "commercial" },
      }),
    );
  });

  it("shows the server's message when an edit is invalid", async () => {
    api.postJson.mockResolvedValue({
      ok: false,
      error: "invalid_edit",
      message: "Term is too long",
    });
    renderList([row({})]);
    fireEvent.click(screen.getByRole("button", { name: 'Edit keyword "example widgets"' }));
    fireEvent.click(screen.getByRole("button", { name: 'Save keyword "example widgets"' }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Term is too long");
    expect(nav.refresh).not.toHaveBeenCalled();
  });

  it("links competitors safely and hides edit for rejected items", () => {
    render(
      <ProposalList
        type="competitor"
        productId="acme-docs"
        productName="Acme Docs"
        items={[
          row({
            type: "competitor",
            value: { name: "Rival Docs", url: "https://rival.example.com" },
            status: "rejected",
          }),
        ]}
      />,
    );
    const link = screen.getByRole("link", { name: /rival\.example\.com/ });
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(link).toHaveAttribute("target", "_blank");
    expect(screen.queryByRole("button", { name: /^Edit/ })).toBeNull();
  });
});
