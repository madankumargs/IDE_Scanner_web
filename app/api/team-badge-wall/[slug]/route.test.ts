import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ available: vi.fn(), privateDb: vi.fn(), from: vi.fn() }));
vi.mock("@/lib/cloudflareDeepScan", () => ({ cloudflarePrivateAvailable: mocks.available }));
vi.mock("@/lib/cloudflarePrivate", () => ({ privateDb: mocks.privateDb }));
vi.mock("@/lib/supabase", () => ({ serviceDb: () => ({ from: mocks.from }) }));

import { GET } from "./route";

const badge = { id: "badge-1", team_id: "team-1", extension_id: "publisher.extension", display_name: "Example", mode: "exact_release", version: "1.2.3", scan_id: "scan-1", scan_job_id: "job-1", artifact_sha256: "a".repeat(64), public_token: "tb_public", visibility: "public", status: "ready", decision: "allow", verdict: "benign", public_outcome: "clear", trust_tier: "verified", trust_label: "Verified", coverage_percent: 100, risk_score: 10, malware_score: 0, capability_assessment: { capabilities: ["network"] }, scanned_at: "2026-09-16T00:00:00Z", last_error: null, created_by: "user-1", created_at: "2026-09-16T00:00:00Z", updated_at: "2026-09-16T00:00:00Z" };

describe("public team badge wall", () => {
  beforeEach(() => { mocks.available.mockReset(); mocks.privateDb.mockReset(); mocks.from.mockReset(); mocks.available.mockReturnValue(false); });

  it("returns only the published sanitized projection", async () => {
    mocks.from.mockImplementation((table: string) => table === "teams"
      ? { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { id: "team-1", slug: "acme" }, error: null }) }) }) }
      : { select: () => ({ eq: () => ({ eq: () => ({ in: () => ({ is: () => ({ order: () => ({ order: () => Promise.resolve({ data: [badge], error: null }) }) }) }) }) }) }) });
    const response = await GET(new Request("http://localhost/api/team-badge-wall/acme"), { params: Promise.resolve({ slug: "acme" }) });
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.team).toEqual({ slug: "acme" });
    expect(body.badges[0]).toMatchObject({ extension_id: "publisher.extension", version: "1.2.3", badge_url: "/api/team-badges/tb_public" });
    expect(body.badges[0]).not.toHaveProperty("scan_job_id");
    expect(body.badges[0]).not.toHaveProperty("created_by");
  });

  it("does not disclose malformed or unknown wall slugs", async () => {
    const response = await GET(new Request("http://localhost/api/team-badge-wall/no"), { params: Promise.resolve({ slug: "no" }) });
    expect(response.status).toBe(404);
  });
});
