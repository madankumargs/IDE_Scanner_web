import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./queue-cloudflare-candidate-scans.mjs", import.meta.url), "utf8");
const workflow = readFileSync(new URL("../.github/workflows/promote-publication.yml", import.meta.url), "utf8");

describe("Cloudflare candidate scan queue", () => {
  it("binds every staged job to the exact scanner build and D1 worker purpose", () => {
    expect(source).toContain("SCANNER_BUILD must be a full 40-character scanner commit SHA.");
    expect(source).toContain("expected_scanner_build");
    expect(source).toContain("public_intelligence");
    expect(source).toContain("registry_product_chunks");
    expect(source).toContain("marketplace.visualstudio.com/_apis/public/gallery/extensionquery");
    expect(source).toContain("MARKETPLACE_PAGE_COUNT");
    expect(source).toContain("existing.status IN ('queued','running')");
    expect(source).toContain("existing.status='complete' AND EXISTS (SELECT 1 FROM app_scan_reports report WHERE report.job_id=existing.id)");
    expect(source).toContain("Bulk scans require an active accuracy-attested Cloudflare release");
    expect(source).toContain("accuracy_gate_sha256");
  });

  it("dispatches the real scanner workers after queueing D1 candidates", () => {
    expect(workflow).toContain("queue-cloudflare-candidate-scans.mjs");
    expect(workflow).toContain("deep-scan.yml");
    expect(workflow).toContain("SCANNER_REPO_READ_TOKEN");
    expect(workflow).toContain('REQUIRE_ACTIVE_RELEASE: "true"');
  });
});
