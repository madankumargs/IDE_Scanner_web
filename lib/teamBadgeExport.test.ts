import { describe, expect, it } from "vitest";
import { renderBadgeMarkdown, renderBadgeSnippets } from "./teamBadgeExport";

const badge = {
  id: "badge-1", team_id: "team-1", extension_id: "publisher.extension", display_name: "Example Extension", mode: "exact_release" as const, version: "1.2.3", scan_id: "scan-1", scan_job_id: null, artifact_sha256: "a".repeat(64), public_token: "tb_public", visibility: "public" as const, status: "ready" as const, decision: "allow", verdict: "benign", public_outcome: "clear", trust_tier: "verified" as const, trust_label: "Verified", coverage_percent: 100, risk_score: 12, malware_score: 0, capability_assessment: null, scanned_at: "2026-09-16T00:00:00Z", last_error: null, created_by: "user-1", created_at: "2026-09-16T00:00:00Z", updated_at: "2026-09-16T00:00:00Z", badge_url: "/api/team-badges/tb_public", report_url: "/extensions/publisher.extension/versions/1.2.3/scans/scan-1",
};

describe("team badge exports", () => {
  it("renders stable exact-release markdown with an embeddable image", () => {
    const output = renderBadgeMarkdown([badge], "https://abscissa.dev");
    expect(output).toContain("publisher.extension@1.2.3");
    expect(output).toContain("https://abscissa.dev/api/team-badges/tb_public");
    expect(output).toContain("GuardRails trust inventory");
  });

  it("omits unpublished badges from copyable snippets", () => {
    expect(renderBadgeSnippets([{ ...badge, visibility: "private" }], "https://abscissa.dev")).toBe("");
  });
});
