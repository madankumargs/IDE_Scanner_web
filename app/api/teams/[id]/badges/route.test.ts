import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authenticated: vi.fn(),
  role: vi.fn(),
  queueDeepScan: vi.fn(),
  from: vi.fn(),
  privateDb: vi.fn(),
  getCloudflareScanProduct: vi.fn(),
  getWorkspaceState: vi.fn(),
  audit: vi.fn(),
  newId: vi.fn(),
  nowIso: vi.fn(),
}));

vi.mock("@/lib/auth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth")>();
  return { ...actual, authenticated: mocks.authenticated };
});
vi.mock("@/lib/teams", () => ({ requireTeamRole: mocks.role }));
vi.mock("@/lib/deepScan", () => ({ queueDeepScan: mocks.queueDeepScan }));
vi.mock("@/lib/supabase", () => ({ serviceDb: () => ({ from: mocks.from }) }));
vi.mock("@/lib/cloudflarePrivate", () => ({
  privateDb: mocks.privateDb,
  newId: mocks.newId,
  nowIso: mocks.nowIso,
}));
vi.mock("@/lib/cloudflareDeepScan", () => ({
  getCloudflareScanProduct: mocks.getCloudflareScanProduct,
}));
vi.mock("@/lib/cloudflareWorkspace", () => ({
  getWorkspaceState: mocks.getWorkspaceState,
  audit: mocks.audit,
}));

import { GET, POST } from "./route";

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

function request(body?: Record<string, unknown>) {
  return new Request("http://localhost/api/teams/team-1/badges", {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
}

describe("team badge endpoint", () => {
  beforeEach(() => {
    mocks.authenticated.mockReset();
    mocks.role.mockReset();
    mocks.queueDeepScan.mockReset();
    mocks.from.mockReset();
    mocks.privateDb.mockReset();
    mocks.getCloudflareScanProduct.mockReset();
    mocks.getWorkspaceState.mockReset();
    mocks.audit.mockReset();
    mocks.newId.mockReset();
    mocks.nowIso.mockReset();
    mocks.authenticated.mockResolvedValue({
      user: { id: "user-1" },
      provider: "supabase",
    });
    mocks.role.mockResolvedValue("analyst");
    mocks.privateDb.mockImplementation(() => {
      throw new Error("Cloudflare D1 is unavailable in this test.");
    });
    mocks.nowIso.mockReturnValue("2026-09-15T10:01:00.000Z");
    mocks.newId.mockReturnValue("badge-generated");
    mocks.audit.mockResolvedValue(undefined);
  });

  it("lists badges through the Supabase compatibility path and derives stale health", async () => {
    const badge = {
      id: "badge-1",
      team_id: "team-1",
      extension_id: "publisher.extension",
      display_name: "Extension",
      version: "1.2.3",
      scan_id: "scan-1",
      scan_job_id: null,
      artifact_sha256: "a".repeat(64),
      public_token: "public-token",
      visibility: "public",
      status: "ready",
      created_by: "user-1",
      created_at: "2026-09-15T10:01:00.000Z",
      updated_at: "2026-09-15T10:01:00.000Z",
    };
    mocks.from.mockImplementation((table: string) => {
      if (table === "team_badges") {
        return {
          select: () => ({
            eq: () => ({
              order: () => Promise.resolve({ data: [badge], error: null }),
            }),
          }),
        };
      }
      return {
        select: () => ({
          eq: () => Promise.resolve({
            data: [{ extension_id: "publisher.extension", last_observed_version: "1.2.4" }],
            error: null,
          }),
        }),
      };
    });

    const response = await GET(request(), {
      params: Promise.resolve({ id: "team-1" }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      badges: [expect.objectContaining({ id: "badge-1", status: "stale" })],
      summary: { total: 1, stale: 1, ready: 0 },
    });
    expect(mocks.role).toHaveBeenCalledWith("team-1", "user-1", [
      "owner",
      "admin",
      "analyst",
      "viewer",
    ]);
  });

  it("promotes a pending Cloudflare badge after its scan callback publishes a report", async () => {
    mocks.authenticated.mockResolvedValue({
      user: { id: "cloudflare-user" },
      provider: "cloudflare",
    });
    const pending = {
      id: "badge-1",
      team_id: "team-1",
      extension_id: "publisher.extension",
      display_name: "Extension",
      mode: "exact_release",
      version: "1.2.3",
      scan_id: null,
      scan_job_id: "job-1",
      artifact_sha256: null,
      public_token: "public-token",
      visibility: "public",
      status: "pending",
      created_by: "cloudflare-user",
      created_at: "2026-09-15T10:01:00.000Z",
      updated_at: "2026-09-15T10:01:00.000Z",
    };
    const run = vi.fn().mockResolvedValue({ success: true });
    const database = {
      prepare: vi.fn((query: string) => ({
        bind: vi.fn(() => ({
          all: query.includes("app_team_badges")
            ? vi.fn().mockResolvedValue({ results: [pending] })
            : vi.fn(),
          first: query.includes("app_scan_jobs")
            ? vi.fn().mockResolvedValue({ id: "job-1", status: "complete", error: null })
            : query.includes("app_scan_reports")
              ? vi.fn().mockResolvedValue({ scan_id: "scan-1" })
              : vi.fn().mockResolvedValue(null),
          run,
        })),
      })),
    };
    mocks.privateDb.mockReturnValue(database);
    mocks.getWorkspaceState.mockResolvedValue({ watchlist: [], audit: [] });
    mocks.getCloudflareScanProduct.mockResolvedValue({ scan });

    const response = await GET(request(), {
      params: Promise.resolve({ id: "team-1" }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      badges: [expect.objectContaining({ status: "ready", scan_id: "scan-1", risk_score: 12 })],
      summary: { total: 1, ready: 1, pending: 0 },
    });
    expect(mocks.getCloudflareScanProduct).toHaveBeenCalledWith(
      "publisher.extension",
      "1.2.3",
      "scan-1",
    );
    expect(mocks.audit).toHaveBeenCalledWith(
      "team-1",
      expect.anything(),
      "cloudflare-user",
      "team_badge_ready",
      "badge",
      "badge-1",
      expect.objectContaining({ status: "ready" }),
    );
    expect(run).toHaveBeenCalled();
  });

  it("moves a completed-but-incomplete Cloudflare report to a terminal failed badge", async () => {
    mocks.authenticated.mockResolvedValue({
      user: { id: "cloudflare-user" },
      provider: "cloudflare",
    });
    const pending = {
      id: "badge-1",
      team_id: "team-1",
      extension_id: "publisher.extension",
      display_name: "Extension",
      mode: "exact_release",
      version: "1.2.3",
      scan_id: null,
      scan_job_id: "job-1",
      artifact_sha256: null,
      public_token: "public-token",
      visibility: "public",
      status: "pending",
      created_by: "cloudflare-user",
      created_at: "2026-09-15T10:01:00.000Z",
      updated_at: "2026-09-15T10:01:00.000Z",
    };
    const run = vi.fn().mockResolvedValue({ success: true });
    const database = {
      prepare: vi.fn((query: string) => ({
        bind: vi.fn(() => ({
          all: query.includes("app_team_badges")
            ? vi.fn().mockResolvedValue({ results: [pending] })
            : vi.fn(),
          first: query.includes("app_scan_jobs")
            ? vi.fn().mockResolvedValue({ id: "job-1", status: "complete", error: null })
            : query.includes("app_scan_reports")
              ? vi.fn().mockResolvedValue({ scan_id: "scan-1" })
              : vi.fn().mockResolvedValue(null),
          run,
        })),
      })),
    };
    mocks.privateDb.mockReturnValue(database);
    mocks.getWorkspaceState.mockResolvedValue({ watchlist: [], audit: [] });
    mocks.getCloudflareScanProduct.mockResolvedValue({
      scan: { ...scan, analysis_status: "incomplete", decision_reason: "Required provider did not finish." },
    });

    const response = await GET(request(), {
      params: Promise.resolve({ id: "team-1" }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      badges: [expect.objectContaining({ status: "failed", last_error: "Required provider did not finish." })],
      summary: { total: 1, failed: 1, pending: 0 },
    });
    expect(mocks.audit).toHaveBeenCalledWith(
      "team-1",
      expect.anything(),
      "cloudflare-user",
      "team_badge_scan_failed",
      "badge",
      "badge-1",
      expect.objectContaining({ status: "failed" }),
    );
  });

  it("promotes a pending Supabase badge after a completed scan job is visible", async () => {
    const pending = {
      id: "badge-1",
      team_id: "team-1",
      extension_id: "publisher.extension",
      display_name: "Extension",
      mode: "exact_release",
      version: "1.2.3",
      scan_id: null,
      scan_job_id: "job-1",
      artifact_sha256: null,
      public_token: "public-token",
      visibility: "public",
      status: "pending",
      created_by: "user-1",
      created_at: "2026-09-15T10:01:00.000Z",
      updated_at: "2026-09-15T10:01:00.000Z",
    };
    const saved = { ...pending, ...scan, status: "ready", scan_id: "scan-1", scan_job_id: "job-1" };
    const update = vi.fn().mockReturnValue({
      eq: () => ({
        eq: () => ({
          select: () => ({ single: () => Promise.resolve({ data: saved, error: null }) }),
        }),
      }),
    });
    mocks.from.mockImplementation((table: string) => {
      if (table === "team_badges") {
        return {
          select: () => ({
            eq: () => ({
              order: () => Promise.resolve({ data: [pending], error: null }),
            }),
          }),
          update,
        };
      }
      if (table === "team_watchlist_items") {
        return { select: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }) };
      }
      if (table === "scan_jobs") {
        return { select: () => ({ in: () => Promise.resolve({ data: [{ id: "job-1", status: "complete", error: null }], error: null }) }) };
      }
      if (table === "scans") {
        return { select: () => ({ in: () => Promise.resolve({ data: [{ ...scan, job_id: "job-1" }], error: null }) }) };
      }
      if (table === "team_audit_events") return { insert: () => Promise.resolve({ error: null }) };
      return {};
    });

    const response = await GET(request(), {
      params: Promise.resolve({ id: "team-1" }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      badges: [expect.objectContaining({ status: "ready", scan_id: "scan-1", risk_score: 12 })],
      summary: { total: 1, ready: 1, pending: 0 },
    });
    expect(update).toHaveBeenCalled();
    expect(mocks.from).toHaveBeenCalledWith("team_audit_events");
  });

  it("creates an immediately ready badge from a completed scan", async () => {
    mocks.queueDeepScan.mockResolvedValue({
      status: "complete",
      scan_id: "scan-1",
      extension_id: "publisher.extension",
      version: "1.2.3",
      reused: true,
    });
    const inserted = vi.fn().mockResolvedValue({
      data: {
        id: "badge-1",
        team_id: "team-1",
        extension_id: "publisher.extension",
        display_name: "Extension",
        version: "1.2.3",
        scan_id: "scan-1",
        scan_job_id: null,
        artifact_sha256: "a".repeat(64),
        public_token: "public-token",
        visibility: "public",
        status: "ready",
        decision: "allow",
        verdict: "benign",
        public_outcome: "clear",
        trust_tier: "verified",
        trust_label: "Verified · behavior matches declaration",
        coverage_percent: 100,
        risk_score: 12,
        malware_score: 0,
        scanned_at: "2026-09-15T10:00:00.000Z",
        created_by: "user-1",
        created_at: "2026-09-15T10:01:00.000Z",
        updated_at: "2026-09-15T10:01:00.000Z",
      },
      error: null,
    });
    mocks.from.mockImplementation((table: string) => {
      if (table === "team_audit_events") {
        return { insert: () => Promise.resolve({ error: null }) };
      }
      if (table === "team_badges") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: () => Promise.resolve({ data: null, error: null }),
              }),
            }),
          }),
          insert: () => ({ select: () => ({ single: inserted }) }),
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

    const response = await POST(
      request({ extension_id: "publisher.extension", version: "1.2.3" }),
      { params: Promise.resolve({ id: "team-1" }) },
    );

    expect(response.status).toBe(201);
    expect(mocks.queueDeepScan).toHaveBeenCalledWith(
      "publisher.extension",
      "1.2.3",
      expect.any(Request),
      "user-1",
      false,
      "team_badge",
    );
    await expect(response.json()).resolves.toMatchObject({
      badge: expect.objectContaining({ status: "ready", risk_score: 12 }),
      reused_scan: true,
    });
    expect(inserted).toHaveBeenCalled();
  });

  it("returns a pending badge when the scan is queued", async () => {
    mocks.queueDeepScan.mockResolvedValue({
      id: "job-1",
      status: "queued",
      extension_id: "publisher.extension",
      version: "1.2.3",
    });
    const inserted = vi.fn().mockResolvedValue({
      data: {
        id: "badge-1",
        team_id: "team-1",
        extension_id: "publisher.extension",
        display_name: "Extension",
        version: "1.2.3",
        scan_id: null,
        scan_job_id: "job-1",
        artifact_sha256: null,
        public_token: "public-token",
        visibility: "public",
        status: "pending",
        created_by: "user-1",
        created_at: "2026-09-15T10:01:00.000Z",
        updated_at: "2026-09-15T10:01:00.000Z",
      },
      error: null,
    });
    mocks.from.mockImplementation((table: string) => {
      if (table === "team_audit_events") {
        return { insert: () => Promise.resolve({ error: null }) };
      }
      if (table === "team_badges") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: () => Promise.resolve({ data: null, error: null }),
              }),
            }),
          }),
          insert: () => ({ select: () => ({ single: inserted }) }),
        };
      }
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({
              eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }),
            }),
          }),
        }),
      };
    });

    const response = await POST(
      request({ extension_id: "publisher.extension", version: "1.2.3" }),
      { params: Promise.resolve({ id: "team-1" }) },
    );

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toMatchObject({
      badge: expect.objectContaining({ status: "pending", scan_job_id: "job-1" }),
    });
  });

  it("rejects malformed release input before queueing a scan", async () => {
    const response = await POST(
      request({ extension_id: "not-an-extension", version: "1.2.3" }),
      { params: Promise.resolve({ id: "team-1" }) },
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "A valid extension id is required.",
    });
    expect(mocks.queueDeepScan).not.toHaveBeenCalled();
  });

  it("does not reactivate a revoked exact-release badge", async () => {
    mocks.from.mockImplementation((table: string) => table === "team_badges"
      ? {
          select: () => ({
            eq: () => ({
              eq: () => ({ maybeSingle: () => Promise.resolve({ data: { id: "badge-1", team_id: "team-1", extension_id: "publisher.extension", version: "1.2.3", status: "revoked", public_token: "public-token" }, error: null }) }),
            }),
          }),
        }
      : {});

    const response = await POST(
      request({ extension_id: "publisher.extension", version: "1.2.3", force: true }),
      { params: Promise.resolve({ id: "team-1" }) },
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "This exact release badge was revoked and cannot be reactivated.",
    });
    expect(mocks.queueDeepScan).not.toHaveBeenCalled();
  });

  it("uses the Cloudflare workspace store for an authenticated Cloudflare session", async () => {
    mocks.authenticated.mockResolvedValue({
      user: { id: "cloudflare-user" },
      provider: "cloudflare",
    });
    mocks.role.mockResolvedValue("owner");
    const insert = vi.fn().mockResolvedValue({ success: true });
    const database = {
      prepare: vi.fn((query: string) => ({
        bind: vi.fn(() => query.startsWith("SELECT")
          ? { first: vi.fn().mockResolvedValue(null) }
          : { run: insert }),
      })),
    };
    mocks.privateDb.mockReturnValue(database);
    mocks.getWorkspaceState.mockResolvedValue({ watchlist: [], audit: [] });
    mocks.getCloudflareScanProduct.mockResolvedValue({ scan });
    mocks.queueDeepScan.mockResolvedValue({
      status: "complete",
      scan_id: "scan-1",
      extension_id: "publisher.extension",
      version: "1.2.3",
      reused: true,
    });

    const response = await POST(
      request({ extension_id: "publisher.extension", version: "1.2.3" }),
      { params: Promise.resolve({ id: "team-1" }) },
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      badge: expect.objectContaining({ status: "ready", scan_id: "scan-1" }),
    });
    expect(mocks.from).not.toHaveBeenCalled();
    expect(insert).toHaveBeenCalled();
    expect(mocks.audit).toHaveBeenCalledWith(
      "team-1",
      expect.anything(),
      "cloudflare-user",
      "team_badge_created",
      "badge",
      expect.any(String),
      expect.objectContaining({ status: "ready" }),
    );
  });
});
