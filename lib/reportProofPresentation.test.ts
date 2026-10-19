import { describe, expect, it } from "vitest";
import { reportProofPresentation } from "./reportProofPresentation";

describe("report proof presentation", () => {
  it("uses grouped detailed evidence", () => {
    const proof = reportProofPresentation({
      scan: { id: "scan-1", capabilities: { filesystem: true } },
      findings: [
        { rule_id: "network", actionability: "review" },
        { rule_id: "note", actionability: "contextual" },
      ],
      files: [{ path: "extension.js" }],
      dependencies: [{ name: "dep" }],
    });
    expect(proof).toMatchObject({ actionable: 1, contextual: 1, capabilities: 1, files: 1, dependencies: 1, artifactSha256Recorded: false, detailAvailable: true });
  });

  it("keeps recorded summary inventory counts without exposing withheld detail", () => {
    const proof = reportProofPresentation({
      scan: {
        id: "scan-2",
        report_detail_state: "summary_only",
        summary_counts_recorded: true,
        actionable_findings_count: 0,
        contextual_findings_count: 13,
        capability_count: 4,
        file_count: 2000,
        dependency_count: 5,
        artifact_sha256: "0f8ef819d4c2007f1bfb3b8efb533e72796e29f06fee600c76d1fb17befb5b95",
      },
    });
    expect(proof).toMatchObject({ actionable: 0, contextual: 13, capabilities: 4, files: 2000, dependencies: 5, artifactSha256Recorded: true, detailAvailable: false });
  });

  it("does not convert unverified summary omissions into zeros", () => {
    const proof = reportProofPresentation({
      scan: { id: "scan-3", report_detail_state: "summary_only", actionable_findings_count: 0, contextual_findings_count: 0 },
    });
    expect(proof).toMatchObject({ actionable: null, contextual: null, capabilities: null, files: null, dependencies: null, detailAvailable: false });
  });

  it("keeps an unscanned release unknown", () => {
    expect(reportProofPresentation({ scan: null })).toMatchObject({ detailAvailable: false, actionable: null, files: null });
  });
});
