import { describe, expect, it } from "vitest";
import {
  badgeKey,
  deriveTeamBadgeStatus,
  teamBadgeFromScan,
  transitionTeamBadgeStatus,
  type TeamBadge,
} from "./teamBadges";

const completeScan = {
  id: "scan-1",
  extension_id: "publisher.extension",
  version: "1.2.3",
  artifact_sha256: "a".repeat(64),
  analysis_status: "complete",
  decision: "allow",
  verdict: "benign",
  public_outcome: "clear",
  analysis_coverage: { status: "complete" },
  capability_assessment: { unexpected: [] },
  risk_score: 12,
  malware_score: 0,
  scanned_at: "2026-09-15T10:00:00.000Z",
};

describe("team badge domain", () => {
  it("uses a case-insensitive extension and exact version as the reuse key", () => {
    expect(badgeKey("Publisher.Extension", "1.2.3")).toBe(
      "publisher.extension@1.2.3",
    );
    expect(badgeKey("publisher.extension", "1.2.4")).not.toBe(
      badgeKey("publisher.extension", "1.2.3"),
    );
  });

  it("creates a ready badge from a completed scan without losing artifact identity", () => {
    const badge = teamBadgeFromScan(completeScan, {
      id: "badge-1",
      team_id: "team-1",
      created_by: "user-1",
      created_at: "2026-09-15T10:01:00.000Z",
      updated_at: "2026-09-15T10:01:00.000Z",
    });

    expect(badge).toMatchObject({
      id: "badge-1",
      team_id: "team-1",
      extension_id: "publisher.extension",
      version: "1.2.3",
      scan_id: "scan-1",
      artifact_sha256: "a".repeat(64),
      status: "ready",
      risk_score: 12,
      malware_score: 0,
      created_by: "user-1",
    });
  });

  it("marks a ready exact badge stale when monitoring sees another release", () => {
    const badge = {
      id: "badge-1",
      team_id: "team-1",
      extension_id: "publisher.extension",
      version: "1.2.3",
      status: "ready",
    } as TeamBadge;

    expect(deriveTeamBadgeStatus(badge, "1.2.4")).toBe("stale");
    expect(deriveTeamBadgeStatus(badge, "1.2.3")).toBe("ready");
    expect(deriveTeamBadgeStatus(badge, null)).toBe("ready");
  });

  it("keeps revoked badges terminal and rejects unsafe lifecycle changes", () => {
    expect(transitionTeamBadgeStatus("pending", "ready")).toBe("ready");
    expect(transitionTeamBadgeStatus("ready", "stale")).toBe("stale");
    expect(transitionTeamBadgeStatus("failed", "pending")).toBe("pending");
    expect(transitionTeamBadgeStatus("revoked", "revoked")).toBe("revoked");
    expect(() => transitionTeamBadgeStatus("revoked", "ready")).toThrow(
      "Cannot transition a revoked badge to ready.",
    );
  });
});
