import { describe, expect, it } from "vitest";
import { validateAccuracyGate } from "./accuracy-gate.mjs";

const validGate = {
  schema_version: "1.0",
  corpus_id: "ide-scanner-production-gate",
  corpus_version: "2026.09.18.1",
  report_identity: {
    scanner_build: "a".repeat(40),
    policy_version: "policy-1",
    ruleset_version: "rules-1",
  },
  gate: { passed: true, checks: { required_pass_rate: true, safe_block_rate: true, malicious_allow_rate: true } },
  summary: {
    required_artifacts: 8,
    required_passed: 8,
    required_pass_rate: 1,
    safe_evaluated: 2,
    safe_block_rate: 0,
    malicious_evaluated: 4,
    malicious_allow_rate: 0,
  },
  holdout: {
    status: "fresh-labeled",
    complete: true,
    artifact_count: 10,
    safe_evaluated: 5,
    malicious_evaluated: 5,
    required_pass_rate: 1,
    safe_block_rate: 0,
    malicious_allow_rate: 0,
    label_counts: { known_safe: 5, known_malicious: 5 },
    scanner_build: "a".repeat(40),
    policy_version: "policy-1",
    ruleset_version: "rules-1",
    runtime_evidence: { required: true, runtime_enabled: true, profile: "deep" },
  },
};

describe("accuracy publication gate", () => {
  it("accepts a complete labelled gate for the matching scanner build", () => {
    expect(validateAccuracyGate(validGate, { scanner_build: "a".repeat(40) })).toEqual([]);
  });

  it("rejects a passed-looking gate with no known-safe evaluation", () => {
    const errors = validateAccuracyGate({
      ...validGate,
      summary: { ...validGate.summary, safe_evaluated: 0 },
    }, { scanner_build: "a".repeat(40) });
    expect(errors).toContain("accuracy gate must evaluate both known-safe and known-malicious fixtures");
  });

  it("rejects the synthetic regression gate when no fresh holdout is attached", () => {
    const regressionOnly = { ...validGate };
    delete regressionOnly.holdout;
    expect(validateAccuracyGate(regressionOnly, { scanner_build: "a".repeat(40) })).toContain(
      "publication requires a complete fresh-labeled holdout gate in addition to regression fixtures",
    );
  });

  it("rejects reuse against a different scanner build", () => {
    expect(validateAccuracyGate(validGate, { scanner_build: "b".repeat(40) })).toContain(
      "accuracy gate scanner_build does not match the publication identity",
    );
  });

  it("rejects a holdout with a malicious allow even when the regression summary passes", () => {
    const errors = validateAccuracyGate({
      ...validGate,
      holdout: { ...validGate.holdout, malicious_allow_rate: 0.1 },
    }, { scanner_build: "a".repeat(40) });
    expect(errors).toContain("fresh-labeled holdout allows known-malicious fixtures");
  });

  it("rejects a holdout with identity drift", () => {
    const errors = validateAccuracyGate({
      ...validGate,
      holdout: { ...validGate.holdout, ruleset_version: "rules-drift" },
    }, { scanner_build: "a".repeat(40) });
    expect(errors).toContain("fresh-labeled holdout ruleset_version does not match the report identity");
  });

  it("rejects a holdout without required deep runtime evidence", () => {
    const errors = validateAccuracyGate({
      ...validGate,
      holdout: { ...validGate.holdout, runtime_evidence: { required: false, runtime_enabled: false, profile: "quick" } },
    }, { scanner_build: "a".repeat(40) });
    expect(errors).toContain("fresh-labeled holdout must prove a required deep runtime scan");
  });

  it("rejects a holdout that is too small to support a publication claim", () => {
    const errors = validateAccuracyGate({
      ...validGate,
      holdout: { ...validGate.holdout, safe_evaluated: 4 },
    }, { scanner_build: "a".repeat(40) });
    expect(errors).toContain("fresh-labeled holdout must include at least 5 known-safe and 5 known-malicious exact artifacts");
  });

  it("rejects holdout summary counts that drift from the frozen labels", () => {
    const errors = validateAccuracyGate({
      ...validGate,
      holdout: { ...validGate.holdout, label_counts: { known_safe: 5, known_malicious: 4 } },
    }, { scanner_build: "a".repeat(40) });
    expect(errors).toContain("fresh-labeled holdout label counts do not match the frozen corpus");
  });
});
