import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { browserAuthHeaders } from "@/lib/browserAuth";

describe("browserAuthHeaders", () => {
  const getSession = vi.fn();
  const db = { auth: { getSession } } as never;

  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    getSession.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("prefers the Cloudflare session and avoids reading Supabase", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ user: { id: "github:1" } }),
    } as Response);

    await expect(browserAuthHeaders(db)).resolves.toEqual({
      Authorization: "Bearer cloudflare-session",
    });
    expect(getSession).not.toHaveBeenCalled();
  });

  it("keeps the Supabase bearer token as the compatibility path", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ user: null }),
    } as Response);
    getSession.mockResolvedValue({
      data: { session: { access_token: "sb-access-token" } },
    });

    await expect(browserAuthHeaders(db)).resolves.toEqual({
      Authorization: "Bearer sb-access-token",
    });
    expect(getSession).toHaveBeenCalledOnce();
  });

  it("falls back to Supabase when the Cloudflare session endpoint is unavailable", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("network unavailable"));
    getSession.mockResolvedValue({
      data: { session: { access_token: "legacy-token" } },
    });

    await expect(browserAuthHeaders(db)).resolves.toEqual({
      Authorization: "Bearer legacy-token",
    });
  });

  it("returns no authorization header when neither provider has a session", async () => {
    vi.mocked(fetch).mockResolvedValue({
      ok: true,
      json: async () => ({ user: null }),
    } as Response);
    getSession.mockResolvedValue({ data: { session: null } });

    await expect(browserAuthHeaders(db)).resolves.toEqual({});
  });
});
