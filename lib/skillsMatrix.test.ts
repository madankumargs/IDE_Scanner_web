import { describe, expect, it } from "vitest";
import { decideSkillScan, scoreSkillFindings, skillDetectionMatrix } from "./skillsMatrix";

describe("skills decision and detection matrix", () => {
  it("keeps the published skill rule matrix complete and namespaced", () => {
    expect(skillDetectionMatrix).toHaveLength(32);
    expect(skillDetectionMatrix.every((rule) => rule.id.startsWith("SK-"))).toBe(true);
    expect(new Set(skillDetectionMatrix.map((rule) => rule.analyzer))).toEqual(new Set(["manifest", "instructions", "scripts", "deps", "archive", "intel", "diff"]));
  });

  it("calculates a hand-checkable critical corroborated score", () => {
    const scores = scoreSkillFindings([{ severity: "CRITICAL", evidenceClass: "corroborated_static", confidence: 1, dimension: "injection_exfil" }]);
    expect(scores.dimensions.injection_exfil).toBe(80);
    expect(scores.malware).toBe(80);
    expect(scores.risk).toBeCloseTo(44, 5);
  });

  it("blocks authoritative evidence before applying coverage", () => {
    expect(decideSkillScan([{ severity: "CRITICAL", evidenceClass: "authoritative", confidence: 1, dimension: "provenance", authoritative: true }], { completedRequired: 0, requiredAnalyzers: 6 })).toBe("block");
  });

  it("does not allow incomplete required coverage", () => {
    expect(decideSkillScan([], { completedRequired: 5, requiredAnalyzers: 6 })).toBe("incomplete");
  });
});
