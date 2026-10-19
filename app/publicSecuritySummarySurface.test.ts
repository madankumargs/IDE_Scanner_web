import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const summary = readFileSync(new URL("./PublicSecuritySummary.tsx", import.meta.url), "utf8");
const versionPage = readFileSync(new URL("./extensions/[id]/versions/[version]/page.tsx", import.meta.url), "utf8");

describe("public quick report", () => {
  it("answers the three installation questions with recorded evidence", () => {
    expect(summary).toContain("Can I install this release?");
    expect(summary).toContain("Why this result?");
    expect(summary).toContain("What should I do next?");
    expect(summary).toContain("Evidence behind this result");
    expect(summary).toContain("Not included in summary");
    expect(versionPage).toContain("reportProofPresentation");
  });
});
