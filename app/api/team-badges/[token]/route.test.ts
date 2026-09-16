import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  privateAvailable: vi.fn(),
  privateDb: vi.fn(),
  cloudflareScanProduct: vi.fn(),
  from: vi.fn(),
}));

vi.mock("@/lib/cloudflareDeepScan", () => ({
  cloudflarePrivateAvailable: mocks.privateAvailable,
  getCloudflareScanProduct: mocks.cloudflareScanProduct,
}));
vi.mock("@/lib/cloudflarePrivate", () => ({ privateDb: mocks.privateDb }));
vi.mock("@/lib/supabase", () => ({ serviceDb: () => ({ from: mocks.from }) }));

import { GET } from "./route";

const badge = {
  id: "badge-1",
  team_id: "team-1",
  extension_id: "publisher.extension",
  version: "1.2.3",
  scan_id: "scan-1",
  public_token: "public-token",
  visibility: "public",
  status: "ready",
  revoked_at: null,
};
const scan = {
  id: "scan-1",
  extension_id: "publisher.extension",
  version: "1.2.3",
  artifact_sha256: "a".repeat(64),
  analysis_status: "complete",
  decision: "allow",
  verdict: "benign",
  public_outcome: "clear",
  analysis_coverage: { status: "complete" },
  capability_assessment: { unexpected: [] },
  risk_score: 12,
  malware_score: 0,
  coverage_percent: 100,
  scanned_at: "2026-09-15T10:00:00.000Z",
};

describe("public team badge projection", () => {
  beforeEach(() => {
    mocks.privateAvailable.mockReturnValue(false);
    mocks.privateDb.mockReset();
    mocks.cloudflareScanProduct.mockReset();
    mocks.from.mockImplementation((table: string) => {
      if (table === "team_badges") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({ maybeSingle: () => Promise.resolve({ data: badge, error: null }) }),
            }),
          }),
        };
      }
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              eq: () => ({ maybeSingle: () => Promise.resolve({ data: scan, error: null }) }),
            }),
          }),
        }),
      };
    });
  });

  it("renders a sessionless scored SVG from only the published badge record", async () => {
    const response = await GET(new Request("http://localhost/api/team-badges/public-token"), {
      params: Promise.resolve({ token: "public-token" }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("image/svg+xml");
    await expect(response.text()).resolves.toContain("risk 12/100");
  });

  it("does not render a private badge", async () => {
    mocks.from.mockImplementation(() => ({
      select: () => ({
        eq: () => ({
          eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }),
        }),
      }),
    }));

    const response = await GET(new Request("http://localhost/api/team-badges/private-token"), {
      params: Promise.resolve({ token: "private-token" }),
    });

    expect(response.status).toBe(404);
  });

  it("keeps a published exact badge resolvable after its watchlist goes stale", async () => {
    mocks.from.mockImplementation((table: string) => {
      if (table === "team_badges") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({ maybeSingle: () => Promise.resolve({ data: { ...badge, status: "stale" }, error: null }) }),
            }),
          }),
        };
      }
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              eq: () => ({ maybeSingle: () => Promise.resolve({ data: scan, error: null }) }),
            }),
          }),
        }),
      };
    });

    const response = await GET(new Request("http://localhost/api/team-badges/public-token"), {
      params: Promise.resolve({ token: "public-token" }),
    });

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toContain("risk 12/100");
  });

  it("renders through the Cloudflare private store without touching Supabase", async () => {
    mocks.privateAvailable.mockReturnValue(true);
    const first = vi.fn().mockResolvedValue(badge);
    mocks.privateDb.mockReturnValue({
      prepare: () => ({ bind: () => ({ first }) }),
    });
    mocks.cloudflareScanProduct.mockResolvedValue({ scan });

    const response = await GET(new Request("http://localhost/api/team-badges/public-token"), {
      params: Promise.resolve({ token: "public-token" }),
    });

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toContain("risk 12/100");
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.cloudflareScanProduct).toHaveBeenCalledWith(
      "publisher.extension",
      "1.2.3",
      "scan-1",
    );
  });
});
