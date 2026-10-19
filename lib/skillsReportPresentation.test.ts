import { describe, expect, it } from "vitest";
import { skillDecisionLabel, skillDecisionReason, skillNextStep, skillReportIdentity } from "./skillsReportPresentation";
import type { SkillScanReport } from "./skillsScanner";

const report = (decision: SkillScanReport["decision"]): SkillScanReport => ({
  source: {
    requestedUrl: "https://github.com/acme/skills/tree/main/demo",
    owner: "acme",
    repo: "skills",
    ref: "main",
    commit: "a".repeat(40),
    skillPath: "demo",
    pinned: false,
    canonicalUrl: "https://github.com/acme/skills/tree/main/demo",
    commitUrl: "https://github.com/acme/skills/commit/" + "a".repeat(40),
  },
  artifact: { contentHash: "b".repeat(64), fileCount: 4, fetchedFileCount: 4, bytes: 100 },
  decision,
  scores: { dimensions: { capability: 2, injection_exfil: 1, supply_chain: 0, provenance: 1, evasion: 0, behaviour_change: 0 }, risk: 4.2, malware: 0 },
  coverage: { completedRequired: 5, requiredAnalyzers: 6, analyzers: {}, limitations: [] },
  findings: [],
  limitations: [],
  scannedAt: "2026-10-19T00:00:00.000Z",
});

describe("Skills report presentation", () => {
  it("keeps the decision, explanation, and next step consistent", () => {
    const incomplete = report("incomplete");
    expect(skillReportIdentity(incomplete)).toBe("acme/skills/demo");
    expect(skillDecisionLabel(incomplete.decision)).toBe("Coverage is incomplete");
    expect(skillDecisionReason(incomplete)).toContain("1 required analyzer is incomplete");
    expect(skillNextStep(incomplete)).toContain("unknown");
  });

  it("does not turn a clean result into an approval claim", () => {
    const allowed = report("allow");
    expect(skillDecisionReason(allowed)).toContain("required static analyzers");
    expect(skillNextStep(allowed)).toContain("normal organization controls");
  });
});
