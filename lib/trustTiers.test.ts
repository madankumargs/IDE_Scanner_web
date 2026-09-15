import { describe, expect, it } from "vitest";
import { deriveTrustTier, trustBadgeText } from "./trustTiers";

describe("deriveTrustTier", () => {
  it("stays unanalyzed while analysis is incomplete", () => {
    const info = deriveTrustTier({ decision: "incomplete" });
    expect(info.tier).toBe("unanalyzed");
    expect(info.label).toBe("Analysis pending");
  });

  it("describes a clean completed scan without moral verdicts", () => {
    const info = deriveTrustTier({
      decision: "allow",
      analysis_status: "complete",
      public_outcome: "clear",
    });
    expect(info.tier).toBe("analyzed");
    expect(info.label).toBe("Analyzed · capabilities documented");
  });

  it("never claims verified before behavioral verification exists", () => {
    const info = deriveTrustTier({
      decision: "review",
      analysis_status: "complete",
      public_outcome: "expected_capability",
      capability_assessment: { matched: ["process_execution"], unexpected: [] },
    });
    expect(info.tier).not.toBe("verified");
    expect(info.tier).toBe("analyzed");
  });

  it("requires completed behavioral verification and coverage for verified", () => {
    const info = deriveTrustTier({
      decision: "review",
      analysis_status: "complete",
      public_outcome: "expected_capability",
      capability_assessment: {
        unexpected: [],
        behavioral_verification: { status: "complete", matches_declaration: true },
      },
      analysis_coverage: { status: "complete" },
    });
    expect(info.tier).toBe("verified");
    expect(info.label).toBe("Verified · behavior matches declaration");
  });

  it("does not verify when behavioral coverage is incomplete", () => {
    const info = deriveTrustTier({
      decision: "allow",
      analysis_status: "complete",
      capability_assessment: {
        unexpected: [],
        behavioral_verification: { status: "complete", matches_declaration: true },
      },
      analysis_coverage: { status: "partial" },
    });
    expect(info.tier).toBe("analyzed");
  });

  it("names the count for undeclared capabilities", () => {
    const info = deriveTrustTier({
      decision: "review",
      analysis_status: "complete",
      public_outcome: "investigate",
      capability_assessment: { unexpected: ["credential_input", "telemetry_endpoint"] },
    });
    expect(info.tier).toBe("attention");
    expect(info.label).toBe("2 undeclared capabilities detected");
  });

  it("keeps preventive blocks in attention, not confirmed risk", () => {
    const info = deriveTrustTier({
      decision: "block",
      analysis_status: "complete",
      public_outcome: "preventive_block",
    });
    expect(info.tier).toBe("attention");
  });

  it("reserves confirmed risk for authoritative malicious evidence", () => {
    const info = deriveTrustTier({
      decision: "block",
      analysis_status: "complete",
      verdict: "malicious",
      public_outcome: "confirmed_threat",
    });
    expect(info.tier).toBe("confirmed_risk");
    expect(info.tone).toBe("block");
  });
});

describe("trustBadgeText", () => {
  it("pins the version into badge text", () => {
    const info = deriveTrustTier({ decision: "allow", analysis_status: "complete" });
    expect(trustBadgeText(info, "3.0.33")).toBe("analyzed · v3.0.33");
  });

  it("keeps attention badges short and lowercase", () => {
    const info = deriveTrustTier({
      decision: "review",
      analysis_status: "complete",
      capability_assessment: { unexpected: ["credential_input"] },
    });
    expect(trustBadgeText(info)).toBe("1 undeclared capability detected");
  });

  it("adds the diagnostic risk score to a generated badge when available", () => {
    const info = deriveTrustTier({ decision: "allow", analysis_status: "complete" });
    expect(trustBadgeText(info, "3.0.33", 7)).toBe("analyzed · risk 7/100 · v3.0.33");
  });
});
