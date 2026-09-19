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
  gate: { passed: true, checks: { required_pass_rate: true, safe_block_rate: true, safe_review_rate: true, malicious_allow_rate: true, incomplete_required: true } },
  summary: {
    required_artifacts: 8,
    required_passed: 8,
    required_failed: 0,
    incomplete_required: 0,
    required_pass_rate: 1,
    safe_evaluated: 2,
    safe_block_rate: 0,
    safe_review_rate: 0,
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
    safe_review_rate: 0,
    malicious_allow_rate: 0,
    malicious_detection_rate: 1,
    dynamic_required: 5,
    dynamic_not_applicable: 5,
    rule_matrix: { "filesystem-access": { fired_on_known_safe: 5, fired_on_known_malicious: 0 } },
    label_counts: { known_safe: 5, known_malicious: 5 },
    scanner_build: "a".repeat(40),
    policy_version: "policy-1",
    ruleset_version: "rules-1",
    runtime_evidence: { required: true, runtime_enabled: true, profile: "deep", external_syscall_trace: true },
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

  it("rejects a holdout whose safe-review rate exceeds the noise ceiling", () => {
    const errors = validateAccuracyGate({
      ...validGate,
      holdout: { ...validGate.holdout, safe_review_rate: 0.4 },
    }, { scanner_build: "a".repeat(40) });
    expect(errors).toContain("fresh-labeled holdout safe review rate exceeds the 20% noise ceiling");
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
    expect(errors).toContain("fresh-labeled holdout must prove a required deep runtime scan with external syscall tracing");
  });

  it("rejects a holdout without external syscall tracing", () => {
    const errors = validateAccuracyGate({
      ...validGate,
      holdout: { ...validGate.holdout, runtime_evidence: { required: true, runtime_enabled: true, profile: "deep", external_syscall_trace: false } },
    }, { scanner_build: "a".repeat(40) });
    expect(errors).toContain("fresh-labeled holdout must prove a required deep runtime scan with external syscall tracing");
  });

  it("rejects a holdout that exercises only one runtime surface", () => {
    const errors = validateAccuracyGate({
      ...validGate,
      holdout: { ...validGate.holdout, dynamic_not_applicable: 0 },
    }, { scanner_build: "a".repeat(40) });
    expect(errors).toContain("fresh-labeled holdout must include both executable-capability and explicit runtime-not-applicable artifacts");
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

  it("rejects a holdout without labelled noise and recall metrics", () => {
    const incomplete = { ...validGate, holdout: { ...validGate.holdout } };
    delete incomplete.holdout.safe_review_rate;
    delete incomplete.holdout.rule_matrix;
    const errors = validateAccuracyGate(incomplete, { scanner_build: "a".repeat(40) });
    expect(errors).toContain("fresh-labeled holdout safe_review_rate must be a number between 0 and 1");
    expect(errors).toContain("fresh-labeled holdout must retain a labelled rule matrix");
  });

  it("rejects a holdout without rule-level evidence", () => {
    const errors = validateAccuracyGate({
      ...validGate,
      holdout: { ...validGate.holdout, rule_matrix: {} },
    }, { scanner_build: "a".repeat(40) });
    expect(errors).toContain("fresh-labeled holdout must retain at least one labelled rule firing");
  });

  it("rejects rule-matrix counts that cannot come from the labelled corpus", () => {
    const errors = validateAccuracyGate({
      ...validGate,
      holdout: {
        ...validGate.holdout,
        rule_matrix: { "filesystem-access": { fired_on_known_safe: 6, fired_on_known_malicious: 0 } },
      },
    }, { scanner_build: "a".repeat(40) });
    expect(errors).toContain("fresh-labeled holdout rule matrix overcounts known_safe artifacts");
  });

  it("rejects a passed-looking gate with an incomplete required check", () => {
    const errors = validateAccuracyGate({
      ...validGate,
      gate: { passed: true, checks: { required_pass_rate: true, safe_block_rate: true, malicious_allow_rate: true } },
    }, { scanner_build: "a".repeat(40) });
    expect(errors).toContain("accuracy gate contains a failed or missing check");
  });

  it("rejects a gate with an out-of-range summary rate", () => {
    const errors = validateAccuracyGate({
      ...validGate,
      summary: { ...validGate.summary, safe_block_rate: -1 },
    }, { scanner_build: "a".repeat(40) });
    expect(errors).toContain("accuracy gate summary safe_block_rate must be a number between 0 and 1");
  });
});
