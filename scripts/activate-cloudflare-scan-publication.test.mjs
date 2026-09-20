import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./activate-cloudflare-scan-publication.mjs", import.meta.url), "utf8");

describe("Cloudflare publication activation boundary", () => {
  it("requires every manifest member to carry the deep runtime contract", () => {
    expect(source).toContain("runtime_contract");
    expect(source).toContain('runtime.profile !== "deep"');
    expect(source).toContain('runtime.execution === "controlled-bubblewrap"');
    expect(source).toContain('runtime.execution === "policy-gated"');
    expect(source).toContain('runtime.runtime_policy === "capability-gated-v1"');
  });

  it("validates immutable manifest identity before the database write", () => {
    expect(source).toContain('from "./publication-manifest.mjs"');
    expect(source).toContain("validatePublicationManifest(extensions)");
  });

  it("rejects a member whose release identity was edited after validation", () => {
    expect(source).toContain('String(item.policy_version || "") !== policyVersion');
    expect(source).toContain('String(item.ruleset_version || "") !== rulesetVersion');
    expect(source).toContain('String(item.score_schema_version || "") !== scoreSchemaVersion');
  });

  it("revalidates remote D1 rows before applying the active-release flip", () => {
    expect(source).toContain('if (apply) {');
    expect(source).toContain('from app_scan_reports r');
    expect(source).toContain('join app_scan_jobs j on j.id=r.job_id');
    expect(source).toContain("cloudflare-publication-revalidation.mjs");
    expect(source).toContain("cloudflarePublicationMismatches");
    expect(source).toContain("Cloudflare activation revalidation failed");
  });
});
