import { describe, expect, it } from "vitest";
import { findCloudflareRegistryCatalogExtension } from "@/lib/cloudflareRegistry";

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
});
