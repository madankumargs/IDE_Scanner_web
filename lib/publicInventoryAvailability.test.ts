import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ section: vi.fn(), snapshot: vi.fn() }));
vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn }));
vi.mock("@/lib/supabase", () => ({ publicDb: () => null, serviceDb: () => null }));
vi.mock("@/lib/cloudflareRegistry", () => ({ getCloudflareRegistrySection: mocks.section }));
vi.mock("@/lib/publicRegistrySnapshot", () => ({ getPublicRegistrySnapshot: mocks.snapshot }));

const inventory = {
  items: [],
  totals: { extensions: 0, releases: 0, complete: 0, allowed: 0, expected: 0, investigate: 0, review: 0, blocked: 0, lastScannedAt: "2026-10-12T00:00:00.000Z" },
  publication: { accuracy_gate_corpus_id: "test", accuracy_gate_corpus_version: "1", accuracy_gate_sha256: "a".repeat(64) },
};
describe("public inventory availability", () => {
  beforeEach(() => { vi.resetModules(); mocks.section.mockReset().mockResolvedValue(null); mocks.snapshot.mockReset().mockResolvedValue(null); });
  it("distinguishes provider failure from a valid empty publication", async () => {
    const { getPublicInventory } = await import("@/lib/productData");
    expect((await getPublicInventory()).availability).toBe("unavailable");
    mocks.section.mockResolvedValue(inventory);
    expect((await getPublicInventory()).availability).toBeUndefined();
  });
  it("retries the mirror and retains the last successful refresh after an outage", async () => {
    const { getPublicInventory } = await import("@/lib/productData");
    mocks.snapshot.mockResolvedValue({ inventory });
    await getPublicInventory();
    mocks.snapshot.mockResolvedValue(null);
    const failed = await getPublicInventory(24, 0, true);
    expect(failed.availability).toBe("unavailable");
    expect(failed.lastSuccessfulRefresh).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(mocks.snapshot).toHaveBeenLastCalledWith(true);
  });
});
