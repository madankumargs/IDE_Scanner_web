import { describe, expect, it } from "vitest";
import { badgeInsight } from "./teamBadgeInsights";

const base = { version: "1.2.4", scanned_at: "2026-09-16T00:00:00Z", risk_score: 48, malware_score: 0, decision: "review", capability_assessment: { capabilities: ["network", "filesystem"] } } as const;

describe("team badge insights", () => {
  it("explains score and capability changes without replacing exact identity", () => {
    expect(badgeInsight(base, { ...base, version: "1.2.3", scanned_at: "2026-09-10T00:00:00Z", risk_score: 20, malware_score: 2, capability_assessment: { capabilities: ["network", "process"] } })).toMatchObject({
      previous_version: "1.2.3",
      risk_delta: 28,
      malware_delta: -2,
      added_capabilities: ["filesystem"],
      removed_capabilities: ["process"],
      changed: true,
    });
  });

  it("gives safe guidance when there is no prior exact report", () => {
    expect(badgeInsight({ ...base, decision: "allow" })).toMatchObject({
      previous_version: null,
      changed: false,
      recommendation: "The exact report is the source of truth for this release.",
    });
  });
});
