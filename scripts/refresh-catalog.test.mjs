import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./refresh-catalog.mjs", import.meta.url), "utf8");
const workflow = readFileSync(new URL("../.github/workflows/catalog-refresh.yml", import.meta.url), "utf8");

describe("catalog refresh publication guard", () => {
  it("requires an explicit switch and an accuracy-attested active release before bulk scans", () => {
    expect(source).toContain("CATALOG_BULK_SCAN_ENABLED");
    expect(source).toContain("accuracy_gate_corpus_id");
    expect(source).toContain("activeRelease.data?.scanner_build");
    expect(source).toContain("const bulkCatalogReady");
    expect(source).toContain("Bulk scan was requested, but no active accuracy-attested release matches the scanner build");
    expect(source).toContain("if (!bulkCatalogReady && !monitoredRelease) continue;");
  });

  it("keeps the bulk switch off by default in scheduled/manual workflow runs", () => {
    expect(workflow).toContain("enable_bulk_scan:");
    expect(workflow).toContain('default: "false"');
    expect(workflow).toContain("CATALOG_BULK_SCAN_ENABLED: ${{ inputs.enable_bulk_scan || 'false' }}");
  });
});
