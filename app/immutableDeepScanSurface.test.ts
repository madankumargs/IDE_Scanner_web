import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const report = readFileSync(
  new URL("./ExtensionDossier.tsx", import.meta.url),
  "utf8",
);
const reportActions = readFileSync(
  new URL("./ReportActions.tsx", import.meta.url),
  "utf8",
);
const page = readFileSync(
  new URL(
    "./extensions/[id]/versions/[version]/scans/[scanId]/page.tsx",
    import.meta.url,
  ),
  "utf8",
);
const gate = readFileSync(
  new URL("./FullReportSignInGate.tsx", import.meta.url),
  "utf8",
);
const polling = readFileSync(
  new URL("./DeepScanButton.tsx", import.meta.url),
  "utf8",
);

describe("immutable Deep Scan product", () => {
  it("keeps the quick result public and gates the detailed report", () => {
    expect(page).not.toContain("redirect(");
    expect(report).toContain("Immutable Deep Scan report");
    expect(reportActions).toContain("Copy link");
    expect(reportActions).toContain("Export evidence");
    expect(report).toContain("artifact_sha256");
    expect(page).toContain("if (!claims)");
    expect(page).toContain("FullReportSignInGate");
    expect(gate).toContain("Sign in to continue");
    expect(gate).toContain("without changing the decision");
  });

  it("does not overlap polling and recovers from transient service failures", () => {
    expect(polling).toContain("requestInFlight");
    expect(polling).toContain("document.visibilityState");
    expect(polling).toContain("consecutiveFailures >= 3");
    expect(polling).toContain("without a trackable job");
    expect(polling).toContain("Your session expired");
  });
});
