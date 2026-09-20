import { describe, expect, it } from "vitest";
import { validatePublicationManifest } from "./publication-manifest.mjs";

const member = (overrides = {}) => ({
  extension_id: "example.safe",
  version: "1.0.0",
  scan_id: "scan-1",
  artifact_hash: "a".repeat(64),
  decision: "allow",
  ...overrides,
});

describe("publication manifest boundary", () => {
  it("accepts unique immutable members", () => {
    const result = validatePublicationManifest([member(), member({ extension_id: "example.review", scan_id: "scan-2", decision: "review" })]);
    expect(result.artifact_count).toBe(2);
  });

  it("accepts pre-query expectations without scan ids", () => {
    expect(validatePublicationManifest([member({ scan_id: "" })], { requireScanId: false }).artifact_count).toBe(1);
  });

  it.each([
    ["missing artifact hash", { artifact_hash: "" }, "invalid artifact SHA-256"],
    ["invalid decision", { decision: "incomplete" }, "invalid publication decision"],
    ["duplicate artifact", {}, "duplicate artifact"],
    ["duplicate scan", { extension_id: "example.other", scan_id: "scan-1" }, "reuses scan_id"],
  ])("rejects %s", (_label, overrides, message) => {
    const members = overrides === undefined
      ? [member(), member()]
      : [member(), member(overrides)];
    expect(() => validatePublicationManifest(members)).toThrow(message);
  });
});
