import { beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const mocks = vi.hoisted(() => ({
  requireTeamRole: vi.fn(),
  serviceDb: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  authenticated: async () => ({ user: { id: "user-1" } }),
}));
vi.mock("@/lib/teams", () => ({
  requireTeamRole: mocks.requireTeamRole,
}));
vi.mock("@/lib/supabase", () => ({ serviceDb: mocks.serviceDb }));
vi.mock("@/lib/entitlements", () => ({ requireEntitlement: vi.fn(), EntitlementError: class EntitlementError extends Error {} }));

import { GET } from "./route";

describe("workspace audit route authorization", () => {
  beforeEach(() => {
    mocks.requireTeamRole.mockReset();
    mocks.serviceDb.mockReset();
  });

  it("allows viewers to read but not download workspace audit data", async () => {
    mocks.requireTeamRole.mockResolvedValue("viewer");
    const response = await GET(
      new Request("http://localhost/api/teams/team-1/audit?format=csv"),
      { params: Promise.resolve({ id: "team-1" }) },
    );

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      error: "Viewer access does not include audit export.",
    });
    expect(mocks.serviceDb).not.toHaveBeenCalled();
  });

  it("keeps viewers on the same decision and monitoring-only audit surface as analysts", () => {
    const source = readFileSync(
      join(process.cwd(), "app/api/teams/[id]/audit/route.ts"),
      "utf8",
    );
    expect(source).toContain('role === "analyst" || role === "viewer"');
    expect(source).toContain('"badge"');
    expect(source).toContain('return mapping[String(value)] || "unknown"');
    expect(source).toContain('.order("id", { ascending: false })');
  });
});
