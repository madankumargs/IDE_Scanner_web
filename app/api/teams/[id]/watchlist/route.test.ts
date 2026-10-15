import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ authenticated: vi.fn(), role: vi.fn(), maybeSingle: vi.fn(), from: vi.fn(), entitlement: vi.fn(), resolveMarketplace: vi.fn() }));
vi.mock("@/lib/auth", () => ({ authenticated: mocks.authenticated }));
vi.mock("@/lib/teams", () => ({ requireTeamRole: mocks.role }));
vi.mock("@/lib/supabase", () => ({ serviceDb: () => ({ from: mocks.from }) }));
vi.mock("@/lib/entitlements", () => ({ requireEntitlement: mocks.entitlement }));
vi.mock("@/lib/marketplace", () => ({ resolveMarketplaceExtension: mocks.resolveMarketplace }));
import { DELETE, GET, POST } from "./route";

describe("team watchlist removal", () => {
  beforeEach(() => {
    mocks.authenticated.mockResolvedValue({ user: { id: "analyst" } });
    mocks.role.mockResolvedValue("analyst");
    mocks.entitlement.mockResolvedValue({ allowed: true });
    mocks.maybeSingle.mockResolvedValue({ data: { extension_id: "GitHub.copilot" }, error: null });
    mocks.from.mockReturnValue({ delete: () => ({ eq: () => ({ ilike: () => ({ select: () => ({ maybeSingle: mocks.maybeSingle }) }) }) }) });
  });

  it("rejects malformed extension identifiers before accessing the database", async () => {
    const response = await DELETE(new Request("http://localhost?extension_id=bad"), { params: Promise.resolve({ id: "team" }) });
    expect(response.status).toBe(400);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("allows analysts to remove only the selected team extension", async () => {
    const response = await DELETE(new Request("http://localhost?extension_id=GitHub.copilot"), { params: Promise.resolve({ id: "team-1" }) });
    expect(response.status).toBe(204);
    expect(mocks.role).toHaveBeenCalledWith("team-1", "analyst", ["owner", "admin", "analyst"]);
  });

  it("anchors monitoring to a complete exact-artifact baseline", async () => {
    const single = vi.fn().mockResolvedValue({ data: { extension_id: "GitHub.copilot", baseline_version: "1.2.3", baseline_artifact_sha256: "a".repeat(64), monitoring_state: "monitoring" }, error: null });
    const upsert = vi.fn(() => ({ select: () => ({ single }) }));
    const scan = { select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { id: "11111111-1111-4111-8111-111111111111", version: "1.2.3", artifact_sha256: "a".repeat(64), analysis_status: "complete", coverage_percent: 100 }, error: null }) }) }) }) };
    const extension = { select: () => ({ ilike: () => ({ maybeSingle: () => Promise.resolve({ data: { id: "GitHub.copilot" }, error: null }) }) }) };
    mocks.from.mockImplementation((table: string) => table === "extensions" ? extension : table === "scans" ? scan : { select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }) }), upsert });
    const response = await POST(new Request("http://localhost", { method: "POST", body: JSON.stringify({ extension_id: "GitHub.copilot", baseline_scan_id: "11111111-1111-4111-8111-111111111111" }) }), { params: Promise.resolve({ id: "team-1" }) });
    expect(response.status).toBe(201);
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ baseline_version: "1.2.3", monitoring_state: "monitoring" }), { onConflict: "team_id,extension_id" });
  });

  it("rejects an otherwise complete report when evidence coverage is incomplete", async () => {
    const scan = { select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: { id: "11111111-1111-4111-8111-111111111111", version: "1.2.3", artifact_sha256: "a".repeat(64), analysis_status: "complete", coverage_percent: 87 }, error: null }) }) }) }) };
    const extension = { select: () => ({ ilike: () => ({ maybeSingle: () => Promise.resolve({ data: { id: "GitHub.copilot" }, error: null }) }) }) };
    mocks.from.mockImplementation((table: string) => table === "extensions" ? extension : table === "scans" ? scan : { select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }) }), upsert: vi.fn() });
    const response = await POST(new Request("http://localhost", { method: "POST", body: JSON.stringify({ extension_id: "GitHub.copilot", baseline_scan_id: "11111111-1111-4111-8111-111111111111" }) }), { params: Promise.resolve({ id: "team-1" }) });
    expect(response.status).toBe(400);
  });

  it("rejects a malformed baseline scan before looking it up", async () => {
    const response = await POST(new Request("http://localhost", { method: "POST", body: JSON.stringify({ extension_id: "GitHub.copilot", baseline_scan_id: "not-a-uuid" }) }), { params: Promise.resolve({ id: "team-1" }) });
    expect(response.status).toBe(400);
  });

  it("registers a valid Marketplace extension before adding it to a Supabase watchlist", async () => {
    mocks.resolveMarketplace.mockResolvedValue({
      extension_id: "openai.chatgpt",
      display_name: "ChatGPT",
      publisher: "openai",
      short_description: "Official ChatGPT extension",
      registry: "vs-marketplace",
      publisher_verified: true,
      install_count: 100,
      rating_average: 4.8,
      icon_url: "https://example.test/icon.png",
    });
    const register = vi.fn().mockResolvedValue({ error: null });
    const extensions = {
      select: () => ({ ilike: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }),
      upsert: register,
    };
    const existing = { select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }) }) };
    const single = vi.fn().mockResolvedValue({ data: { extension_id: "openai.chatgpt", monitoring_state: "baseline_pending" }, error: null });
    const watches = { upsert: vi.fn(() => ({ select: () => ({ single }) })) };
    // The first team_watchlist_items lookup uses `select`; the final write uses
    // the table's upsert chain.
    mocks.from.mockImplementation((table: string) => {
      if (table === "extensions") return extensions;
      if (table === "team_watchlist_items") {
        return {
          select: existing.select,
          upsert: watches.upsert,
        };
      }
      return { select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: null }) }) }) }) };
    });

    const response = await POST(new Request("http://localhost", { method: "POST", body: JSON.stringify({ extension_id: "openai.chatgpt" }) }), { params: Promise.resolve({ id: "team-1" }) });
    expect(response.status).toBe(201);
    expect(register).toHaveBeenCalledWith(expect.objectContaining({ id: "openai.chatgpt", publisher_verified: true }), { onConflict: "id" });
    expect(watches.upsert).toHaveBeenCalledWith(expect.objectContaining({ extension_id: "openai.chatgpt" }), { onConflict: "team_id,extension_id" });
  });

  it("returns observable registry monitoring health with the watchlist", async () => {
    const watchOrder=vi.fn().mockResolvedValue({data:[{extension_id:"GitHub.copilot",baseline_version:"1.2.3",monitoring_state:"monitoring",last_event_at:"2026-08-06T12:00:00.000Z"}],error:null});
    const refreshLimit=vi.fn().mockResolvedValue({data:[{registry:"vs-marketplace",status:"complete",started_at:"2026-08-06T12:00:00.000Z",completed_at:"2026-08-06T12:17:00.000Z",error:null},{registry:"openvsx",status:"complete",started_at:"2026-08-06T12:00:00.000Z",completed_at:"2026-08-06T12:15:00.000Z",error:null}],error:null});
    mocks.from.mockImplementation((table:string)=>table==="team_watchlist_items"?{select:()=>({eq:()=>({order:watchOrder})})}:{select:()=>({order:()=>({limit:refreshLimit})})});
    const response=await GET(new Request("http://localhost"),{params:Promise.resolve({id:"team-1"})});
    expect(response.status).toBe(200);
    const body=await response.json();
    expect(body.health).toMatchObject({status:"healthy",last_checked_at:"2026-08-06T12:17:00.000Z",next_check_at:"2026-08-06T18:17:00.000Z",cadence_hours:6});
    expect(body.items[0].last_event_at).toBe("2026-08-06T12:00:00.000Z");
  });
});
