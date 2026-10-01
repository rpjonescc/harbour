import { POST as reindex } from "./reindex/route";
import { GET as search } from "./search/route";

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  ensureBrain: vi.fn(),
  requestReindex: vi.fn(),
  searchBrain: vi.fn(),
}));
vi.mock("@/lib/auth/guard", () => ({ getSession: mocks.getSession }));
vi.mock("@/lib/brain/runtime", () => ({
  ensureBrain: mocks.ensureBrain,
  requestReindex: mocks.requestReindex,
}));
vi.mock("@/lib/brain/search", () => ({ searchBrain: mocks.searchBrain }));
vi.mock("@/lib/db/client", () => ({ getDb: () => ({}) }));

const ORIGIN = "https://harbour.example.ts.net";
const available = { available: true, root: "/example/brain", watchError: null, indexError: null };
const unavailable = { available: false, root: "/example/brain", reason: "missing" };

const searchRequest = () => new Request(`${ORIGIN}/api/brain/search?q=geo`);
const reindexRequest = (origin = ORIGIN) =>
  new Request(`${ORIGIN}/api/brain/reindex`, {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: "{}",
  });

describe("brain API routes", () => {
  beforeEach(() => {
    mocks.getSession.mockResolvedValue({ id: "session" });
    mocks.ensureBrain.mockReturnValue(available);
    mocks.requestReindex.mockReturnValue(true);
    mocks.searchBrain.mockReturnValue([{ path: "a.md", title: "A", snippet: [] }]);
  });
  afterEach(() => vi.resetAllMocks());

  describe("GET /api/brain/search", () => {
    it("requires a session", async () => {
      mocks.getSession.mockResolvedValue(null);
      expect((await search(searchRequest())).status).toBe(401);
    });

    it("reports an unavailable brain as 409", async () => {
      mocks.ensureBrain.mockReturnValue(unavailable);
      const response = await search(searchRequest());
      expect(response.status).toBe(409);
      expect(await response.json()).toEqual({ error: "brain_unavailable" });
    });

    it("returns hits for the query", async () => {
      const response = await search(searchRequest());
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ hits: [{ path: "a.md", title: "A", snippet: [] }] });
      expect(mocks.searchBrain).toHaveBeenCalledWith({}, "geo");
    });
  });

  describe("POST /api/brain/reindex", () => {
    it("rejects cross-site requests", async () => {
      expect((await reindex(reindexRequest("https://elsewhere.example"))).status).toBe(403);
      expect(mocks.requestReindex).not.toHaveBeenCalled();
    });

    it("requires a session", async () => {
      mocks.getSession.mockResolvedValue(null);
      expect((await reindex(reindexRequest())).status).toBe(401);
    });

    it("reports an unavailable brain as 409", async () => {
      mocks.ensureBrain.mockReturnValue(unavailable);
      expect((await reindex(reindexRequest())).status).toBe(409);
    });

    it("starts a reindex", async () => {
      const response = await reindex(reindexRequest());
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ started: true });
    });
  });
});
