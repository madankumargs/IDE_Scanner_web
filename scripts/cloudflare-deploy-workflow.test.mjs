import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const workflow = readFileSync(new URL("../.github/workflows/cloudflare-deploy.yml", import.meta.url), "utf8");

describe("Cloudflare production deployment boundary", () => {
  it("fails closed when the production token is missing instead of skipping deployment", () => {
    expect(workflow).toContain("CLOUDFLARE_API_TOKEN is required for a production deployment.");
    expect(workflow).toContain("exit 1");
    expect(workflow).not.toContain("configured=false");
    expect(workflow).not.toContain("steps.credentials.outputs.configured");
  });

  it("uses the repository-pinned Node runtime", () => {
    expect(workflow).toContain("node-version-file: .nvmrc");
  });
});
