import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authenticated: vi.fn(),
  queueDeepScan: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ authenticated: mocks.authenticated }));
vi.mock("@/lib/deepScan", () => ({ queueDeepScan: mocks.queueDeepScan }));
vi.mock("@/lib/marketplace", () => ({ normalizeMarketplaceId: (value: string) => value.trim() }));

import { POST } from "./route";

function request(body: unknown, headers?: HeadersInit) {
  return new Request("http://localhost/api/scans/marketplace", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

describe("legacy marketplace Deep Scan endpoint", () => {
  beforeEach(() => {
    mocks.authenticated.mockReset();
    mocks.queueDeepScan.mockReset();
  });

  it("accepts the shared authenticated provider contract", async () => {
    mocks.authenticated.mockResolvedValue({ user: { id: "cloudflare-user" }, provider: "cloudflare", db: null });
    mocks.queueDeepScan.mockResolvedValue({ id: "job-1", status: "queued" });
    const response = await POST(request({ id: " publisher.extension ", version: "1.2.3" }, { Authorization: "Bearer cloudflare-session" }));
    expect(response.status).toBe(202);
    expect(mocks.authenticated).toHaveBeenCalledWith(expect.any(Request));
    expect(mocks.queueDeepScan).toHaveBeenCalledWith("publisher.extension", "1.2.3", expect.any(Request), "cloudflare-user");
  });

  it("preserves the auth-required response for missing or expired sessions", async () => {
    mocks.authenticated.mockRejectedValue(new Error("Authentication required."));
    const response = await POST(request({ id: "publisher.extension" }));
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ code: "auth_required" });
    expect(mocks.queueDeepScan).not.toHaveBeenCalled();
  });
});
