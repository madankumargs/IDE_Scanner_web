import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./build-cloudflare-registry-snapshot.mjs", import.meta.url), "utf8");

describe("Cloudflare registry snapshot builder", () => {
  it("binds the public registry to the active attested release members", () => {
    expect(source).toContain("FROM app_scan_publication_releases");
    expect(source).toContain("FROM app_scan_publication_release_reports p");
    expect(source).toContain("if (!rows.length || rows.length !== Number(activeRelease.expected_reports || rows.length))");
    expect(source).toContain("accuracy_gate_sha256");
  });

  it("does not duplicate unbounded report evidence into the catalogue", () => {
    expect(source).toContain("compactInventory.file_count = rawFiles.length");
    expect(source).toContain("delete compactDetail.findings;");
    expect(source).toContain("delete compactDetail.dependency_inventory;");
    expect(source).toContain("latest_scan: null");
    expect(source).toContain('detail_state: "summary_only"');
    expect(source).toContain("findings: [],");
    expect(source).toContain("files: [],");
    expect(source).toContain("dependencies: [],");
  });

  it("rejects incomplete or non-canonical report members", () => {
    expect(source).toContain('String(detail.analysis_status) !== "complete"');
    expect(source).toContain('coverage.required_providers_complete !== true');
    expect(source).toContain("VALID_DECISIONS.has(String(detail.decision))");
    expect(source).toContain("identity.sha256).toLowerCase() !== String(row.artifact_sha256).toLowerCase()");
  });
});
