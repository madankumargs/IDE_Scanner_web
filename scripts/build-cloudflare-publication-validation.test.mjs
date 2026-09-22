import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./build-cloudflare-publication-validation.mjs", import.meta.url), "utf8");

describe("Cloudflare publication validation boundary", () => {
  it("selects only public or benchmark jobs", () => {
    expect(source).toContain("join app_scan_jobs j on j.id = r.job_id");
    expect(source).toContain("j.scan_purpose in ('public_intelligence','benchmark')");
    expect(source).toContain("j.expected_scanner_build");
    expect(source).toContain("mergeChunkedCloudflareReports");
  });

  it("requires the shared controlled-runtime publication contract", () => {
    expect(source).toContain("publication-runtime.mjs");
    expect(source).toContain("publication-canonical.mjs");
    expect(source).toContain("publicCanonicalMismatch");
    expect(source).toContain("singleExtensionDetail");
    expect(source).toContain("runtimeMismatch");
    expect(source).toContain("runtime_contract");
  });

  it("validates the generated manifest before writing it", () => {
    expect(source).toContain("validatePublicationManifest");
    expect(source).toContain("validatePublicationManifest(validation.extensions);");
  });

  it("quarantines incomplete reports instead of publishing them", () => {
    expect(source).toContain("const quarantined = [];");
    expect(source).toContain("const analysisIncomplete =");
    expect(source).toContain("quarantined.push({");
    expect(source).toContain("quarantined,");
  });
});
