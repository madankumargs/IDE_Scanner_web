export const ACCURACY_GATE_SCHEMA_VERSION = "1.0";

export function validateAccuracyGate(value, expected = {}) {
  const errors = [];
  const gate = object(value);
  const identity = object(gate.report_identity);
  const checks = object(gate.gate)?.checks;
  const summary = object(gate.summary);

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
