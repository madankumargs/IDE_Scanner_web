import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ context: vi.fn() }));
vi.mock("@opennextjs/cloudflare", () => ({ getCloudflareContext: mocks.context }));
vi.mock("next/cache", () => ({ unstable_cache: (callback: (...args: never[]) => unknown) => callback }));

import { findCloudflareRegistryCatalogExtension, getCloudflareRegistrySection } from "@/lib/cloudflareRegistry";

function database(activeRows: Array<Record<string, unknown>>, legacyRows: Array<Record<string, unknown>>) {
  const prepare = vi.fn((query: string) => ({
    bind: vi.fn(() => ({
      all: vi.fn(async () => ({ results: query.includes("registry_section_chunks_v2") ? activeRows : legacyRows })),
    })),
  }));
  mocks.context.mockReturnValue({ env: { ABSCISSA_REGISTRY: { prepare } } });
  return prepare;
}

describe("Cloudflare registry catalog", () => {
  it("finds extensions in the D1 array payload", () => {
    expect(findCloudflareRegistryCatalogExtension(
      [{ id: "ms-python.python", latest_version: "2026.7.2026082601" }],
      "MS-PYTHON.PYTHON",
    )).toEqual({ id: "ms-python.python", latest_version: "2026.7.2026082601" });
  });

  it("keeps compatibility with wrapped catalog payloads", () => {
    expect(findCloudflareRegistryCatalogExtension(
      { catalog: [{ id: "foo.bar" }] },
      "foo.bar",
    )).toEqual({ id: "foo.bar" });
  });

  it("does not combine an incomplete active generation with legacy chunks", async () => {
    const prepare = database(
      [{ active_publication_id: "publication-2", payload: null }],
      [{ payload: JSON.stringify([{ id: "legacy.extension" }]) }],
    );
    await expect(getCloudflareRegistrySection("catalog")).resolves.toBeNull();
    expect(prepare).toHaveBeenCalledTimes(1);
  });

  it("uses legacy chunks only before a v2 active pointer exists", async () => {
    database(
      [],
      [{ payload: JSON.stringify([{ id: "legacy.extension" }]) }],
    );
    await expect(getCloudflareRegistrySection("catalog")).resolves.toEqual([{ id: "legacy.extension" }]);
  });
});
