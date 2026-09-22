import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(new URL("../.github/workflows/promote-publication.yml", import.meta.url), "utf8");

describe("publication promotion workflow boundary", () => {
  it("downloads the scanner gate by an explicit run ID and validates its identity", () => {
    expect(workflow).toContain("scanner-publication-accuracy-gate");
    expect(workflow).toContain("repository: preethamak/IDE_Scanner");
    expect(workflow).toContain("run-id: ${{ inputs.scanner_run_id }}");
    expect(workflow).toContain("Publication accuracy holdout");
    expect(workflow).toContain('run.get("conclusion") != "success"');
    expect(workflow).toContain('run.get("head_repository") or {}');
    expect(workflow).toContain("scanner_build does not match the downloaded accuracy gate");
    expect(workflow).toContain('gate.get("holdout", {}).get("status") != "fresh-labeled"');
  });

  it("keeps activation explicit and invokes the immutable activation script only after validation", () => {
    expect(workflow).toContain("if: ${{ inputs.activate == true }}");
    expect(workflow).toContain("needs: validate");
    expect(workflow).toContain("Build Supabase publication validation");
    expect(workflow).toContain("build-publication-validation.mjs");
    expect(workflow).toContain("--expected-reports");
    expect(workflow).toContain("activate-scan-publication.mjs");
    expect(workflow).toContain("activate-cloudflare-scan-publication.mjs");
    expect(workflow).toContain("--apply");
  });

  it("keeps bulk queueing opt-in and downstream of activation", () => {
    expect(workflow).toContain("queue_bulk_scan:");
    expect(workflow).toContain("default: false");
    expect(workflow).toContain("if: ${{ inputs.activate == true && inputs.queue_bulk_scan == true }}");
    expect(workflow).toContain("needs: activate");
    expect(workflow).toContain("Queue bounded public scans in Cloudflare D1");
    expect(workflow).toContain('REQUIRE_ACTIVE_RELEASE: "true"');
    expect(workflow).toContain("publish-registry:");
    expect(workflow).toContain("needs: [activate, publish-registry]");
    expect(workflow).toContain("build-cloudflare-registry-snapshot.mjs");
    expect(workflow).toContain("registry-state.json");
    expect(workflow).toContain("jobs_per_worker=16");
    expect(workflow).toContain("runs=$(( (SCAN_BATCH_LIMIT + 255) / 256 ))");
  });

  it("offers a separate candidate queue before activation", () => {
    expect(workflow).toContain("queue_candidate_scan:");
    expect(workflow).toContain("queue-candidate-scan:");
    expect(workflow).toContain("Reject candidate queue and activation in one run");
    expect(workflow).toContain("queue_candidate_scan and activate are separate promotion phases");
    expect(workflow).toContain("Queue staged candidate scans in Cloudflare D1");
    expect(workflow).toContain("SCANNER_BUILD: ${{ inputs.scanner_build }}");
  });

  it("fails closed when either cross-repository or Cloudflare credentials are absent", () => {
    expect(workflow).toContain("SCANNER_REPO_READ_TOKEN is required");
    expect(workflow).toContain("CLOUDFLARE_API_TOKEN is required");
  });
});
