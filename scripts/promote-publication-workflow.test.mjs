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
    expect(workflow).toContain("activate-cloudflare-scan-publication.mjs");
    expect(workflow).toContain("--apply");
  });

  it("keeps bulk queueing opt-in and downstream of activation", () => {
    expect(workflow).toContain("queue_bulk_scan:");
    expect(workflow).toContain("default: false");
    expect(workflow).toContain("if: ${{ inputs.activate == true && inputs.queue_bulk_scan == true }}");
    expect(workflow).toContain("needs: activate");
    expect(workflow).toContain("-f enable_bulk_scan=true");
  });

  it("fails closed when either cross-repository or Cloudflare credentials are absent", () => {
    expect(workflow).toContain("SCANNER_REPO_READ_TOKEN is required");
    expect(workflow).toContain("CLOUDFLARE_API_TOKEN is required");
  });
});
