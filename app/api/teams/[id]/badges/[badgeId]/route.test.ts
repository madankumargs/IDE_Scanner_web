import { beforeEach, describe, expect, it, vi } from "vitest";
import { TeamAuthorizationError } from "@/lib/teamApiError";

const mocks = vi.hoisted(() => ({
  authenticated: vi.fn(),
  role: vi.fn(),
  from: vi.fn(),
  privateDb: vi.fn(),
  getWorkspaceState: vi.fn(),
  audit: vi.fn(),
  nowIso: vi.fn(),
}));

vi.mock("@/lib/auth", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth")>()),
  authenticated: mocks.authenticated,
}));
vi.mock("@/lib/teams", () => ({ requireTeamRole: mocks.role }));
vi.mock("@/lib/supabase", () => ({ serviceDb: () => ({ from: mocks.from }) }));
vi.mock("@/lib/cloudflarePrivate", () => ({ privateDb: mocks.privateDb, nowIso: mocks.nowIso }));
vi.mock("@/lib/cloudflareWorkspace", () => ({ getWorkspaceState: mocks.getWorkspaceState, audit: mocks.audit }));

import { GET, PATCH } from "./route";

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
  visibility: "private",
  status: "ready",
  risk_score: 12,
  malware_score: 0,
  coverage_percent: 100,
  created_by: "user-1",
  created_at: "2026-09-15T10:00:00.000Z",
  updated_at: "2026-09-15T10:00:00.000Z",
};

function patchRequest(body: Record<string, unknown>) {
  return new Request("http://localhost/api/teams/team-1/badges/badge-1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("team badge detail endpoint", () => {
  beforeEach(() => {
    mocks.authenticated.mockReset();
    mocks.role.mockReset();
    mocks.from.mockReset();
    mocks.privateDb.mockReset();
    mocks.getWorkspaceState.mockReset();
    mocks.audit.mockReset();
    mocks.nowIso.mockReset();
    mocks.authenticated.mockResolvedValue({ user: { id: "user-1" }, provider: "supabase" });
    mocks.role.mockResolvedValue("owner");
    mocks.nowIso.mockReturnValue("2026-09-16T10:00:00.000Z");
    mocks.getWorkspaceState.mockResolvedValue({ watchlist: [], audit: [] });
    mocks.audit.mockResolvedValue(undefined);
  });

  it("returns an authorized badge through the Supabase compatibility path", async () => {
    mocks.from.mockImplementation((table: string) => table === "team_badges"
      ? { select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: badge, error: null }) }) }) }) }
      : { select: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }) });

    const response = await GET(new Request("http://localhost/api/teams/team-1/badges/badge-1"), {
      params: Promise.resolve({ id: "team-1", badgeId: "badge-1" }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      badge: { id: "badge-1", visibility: "private", report_url: expect.stringContaining("scan-1") },
    });
  });

  it("lets an owner publish a badge and records the publication audit", async () => {
    const updated = { ...badge, visibility: "public", updated_at: "2026-09-16T10:00:00.000Z" };
    mocks.from.mockImplementation((table: string) => {
      if (table === "team_badges") {
        return {
          select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: badge, error: null }) }) }) }),
          update: () => ({ eq: () => ({ eq: () => ({ select: () => ({ single: () => Promise.resolve({ data: updated, error: null }) }) }) }) }),
        };
      }
      if (table === "team_audit_events") return { insert: () => Promise.resolve({ error: null }) };
      return { select: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }) };
    });

    const response = await PATCH(patchRequest({ visibility: "public" }), {
      params: Promise.resolve({ id: "team-1", badgeId: "badge-1" }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ badge: { visibility: "public" } });
    expect(mocks.from).toHaveBeenCalledWith("team_audit_events");
  });

  it("uses the Cloudflare store for revocation and blocks Supabase access", async () => {
    mocks.authenticated.mockResolvedValue({ user: { id: "user-1" }, provider: "cloudflare" });
    const update = vi.fn().mockResolvedValue({ success: true });
    const database = {
      prepare: vi.fn((query: string) => ({
        bind: vi.fn(() => query.startsWith("SELECT")
          ? { first: vi.fn().mockResolvedValue(badge) }
          : { run: update }),
      })),
    };
    mocks.privateDb.mockReturnValue(database);

    const response = await PATCH(patchRequest({ revoke: true }), {
      params: Promise.resolve({ id: "team-1", badgeId: "badge-1" }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ badge: { status: "revoked", visibility: "private" } });
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.audit).toHaveBeenCalledWith(
      "team-1",
      expect.anything(),
      "user-1",
      "team_badge_revoked",
      "badge",
      "badge-1",
      expect.objectContaining({ status: "revoked" }),
    );
  });

  it("does not let a viewer publish or revoke a badge", async () => {
    mocks.role.mockRejectedValue(new TeamAuthorizationError());

    const response = await PATCH(patchRequest({ visibility: "public" }), {
      params: Promise.resolve({ id: "team-1", badgeId: "badge-1" }),
    });

    expect(response.status).toBe(403);
    expect(mocks.privateDb).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
  });
});
