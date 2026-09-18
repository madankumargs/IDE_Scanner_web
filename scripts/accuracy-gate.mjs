export const ACCURACY_GATE_SCHEMA_VERSION = "1.0";
export const MIN_FRESH_HOLDOUT_SAFE = 5;
export const MIN_FRESH_HOLDOUT_MALICIOUS = 5;

export function validateAccuracyGate(value, expected = {}) {
  const errors = [];
  const gate = object(value);
  const identity = object(gate.report_identity);
  const checks = object(gate.gate)?.checks;
  const summary = object(gate.summary);
  const holdout = object(gate.holdout);
  const runtimeEvidence = object(holdout.runtime_evidence);

  if (String(gate.schema_version || "") !== ACCURACY_GATE_SCHEMA_VERSION) {
    errors.push(`accuracy gate schema must be ${ACCURACY_GATE_SCHEMA_VERSION}`);
  }
  if (!String(gate.corpus_id || "").trim() || !String(gate.corpus_version || "").trim()) {
    errors.push("accuracy gate must identify a versioned labelled corpus");
  }
  if (object(gate.gate).passed !== true) errors.push("accuracy gate did not pass");
  if (!checks || Object.values(checks).some((value) => value !== true)) {
    errors.push("accuracy gate contains a failed or missing check");
  }

  for (const [field, expectedValue] of Object.entries(expected)) {
    if (expectedValue === undefined || expectedValue === null || expectedValue === "") continue;
    if (String(identity[field] || "") !== String(expectedValue)) {
      errors.push(`accuracy gate ${field} does not match the publication identity`);
    }
  }

  const requiredArtifacts = number(summary.required_artifacts);
  const requiredPassed = number(summary.required_passed);
  const safeEvaluated = number(summary.safe_evaluated);
  const maliciousEvaluated = number(summary.malicious_evaluated);
  if (requiredArtifacts < 1 || requiredPassed !== requiredArtifacts) {
    errors.push("accuracy gate has incomplete required corpus coverage");
  }
  if (safeEvaluated < 1 || maliciousEvaluated < 1) {
    errors.push("accuracy gate must evaluate both known-safe and known-malicious fixtures");
  }
  if (number(summary.required_pass_rate) < 1) errors.push("accuracy gate required pass rate is below 100 percent");
  if (number(summary.safe_block_rate) > 0) errors.push("accuracy gate has known-safe blocks");
  if (number(summary.malicious_allow_rate) > 0) errors.push("accuracy gate allows known-malicious fixtures");
  if (holdout.status !== "fresh-labeled" || holdout.complete !== true) {
    errors.push("publication requires a complete fresh-labeled holdout gate in addition to regression fixtures");
  }
  if (number(holdout.safe_evaluated) < MIN_FRESH_HOLDOUT_SAFE || number(holdout.malicious_evaluated) < MIN_FRESH_HOLDOUT_MALICIOUS) {
    errors.push(`fresh-labeled holdout must include at least ${MIN_FRESH_HOLDOUT_SAFE} known-safe and ${MIN_FRESH_HOLDOUT_MALICIOUS} known-malicious exact artifacts`);
  }
  const holdoutArtifacts = number(holdout.artifact_count);
  const holdoutEvaluated = number(holdout.safe_evaluated) + number(holdout.malicious_evaluated);
  if (holdoutArtifacts < 2 || holdoutEvaluated !== holdoutArtifacts) {
    errors.push("fresh-labeled holdout has incomplete exact-artifact coverage");
  }
  if (number(holdout.required_pass_rate) < 1) {
    errors.push("fresh-labeled holdout required pass rate is below 100 percent");
  }
  if (number(holdout.safe_block_rate) > 0) {
    errors.push("fresh-labeled holdout has known-safe blocks");
  }
  if (number(holdout.malicious_allow_rate) > 0) {
    errors.push("fresh-labeled holdout allows known-malicious fixtures");
  }
  const labelCounts = object(holdout.label_counts);
  if (number(labelCounts.known_safe) !== number(holdout.safe_evaluated)
    || number(labelCounts.known_malicious) !== number(holdout.malicious_evaluated)) {
    errors.push("fresh-labeled holdout label counts do not match the frozen corpus");
  }
  if (runtimeEvidence.required !== true || runtimeEvidence.runtime_enabled !== true || String(runtimeEvidence.profile || "") !== "deep") {
    errors.push("fresh-labeled holdout must prove a required deep runtime scan");
  }
  for (const field of ["scanner_build", "policy_version", "ruleset_version"]) {
    if (holdout[field] && String(holdout[field]) !== String(identity[field] || "")) {
      errors.push(`fresh-labeled holdout ${field} does not match the report identity`);
    }
  }

  return errors;
}

export function assertAccuracyGate(value, expected = {}) {
  const errors = validateAccuracyGate(value, expected);
  if (errors.length) throw new Error(`Accuracy gate rejected publication:\n- ${errors.join("\n- ")}`);
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function number(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : -1;
}
