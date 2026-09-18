import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";
import { assertAccuracyGate } from "./accuracy-gate.mjs";

const arguments_ = process.argv.slice(2);
const reportPath = valueAfter("--report");
const accuracyGatePath = valueAfter("--accuracy-gate");
const apply = arguments_.includes("--apply");
if (!reportPath || !accuracyGatePath) throw new Error("--report and --accuracy-gate are required");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Production Supabase service credentials are required.");

const report = JSON.parse(await readFile(reportPath, "utf8"));
const accuracyGateBytes = await readFile(accuracyGatePath);
const accuracyGate = JSON.parse(accuracyGateBytes.toString("utf8"));
const expected = Array.isArray(report.extensions) ? report.extensions : [];
const scannerBuild = String(report.scanner_build || "");
const policyVersion = String(report.policy_version || "");
const rulesetVersion = String(report.ruleset_version || "");
if (!expected.length || !/^[0-9a-f]{40}$/.test(scannerBuild) || !policyVersion || !rulesetVersion) {
  throw new Error("The validation report has no complete release identity.");
}
assertAccuracyGate(accuracyGate, {
  scanner_build: scannerBuild,
  policy_version: policyVersion,
  ruleset_version: rulesetVersion,
});
const accuracyGateSha256 = createHash("sha256").update(accuracyGateBytes).digest("hex");
if (String(report.accuracy_gate_sha256 || "") !== accuracyGateSha256) {
  throw new Error("The publication validation report was not built from the supplied accuracy gate.");
}

const db = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const { data, error } = await db.from("scans")
  .select("id,extension_id,version,artifact_sha256,decision,severity,analysis_status,coverage_percent,analysis_coverage,canonical_report,policy_version,ruleset_version,score_schema_version,scanner_build,scanned_at")
  .in("scan_purpose", ["public_intelligence", "benchmark"])
  .eq("scanner_build", scannerBuild)
  .eq("policy_version", policyVersion)
  .eq("ruleset_version", rulesetVersion)
  .is("superseded_at", null)
  .order("scanned_at", { ascending: false })
  .limit(5000);
if (error) throw error;

const candidates = new Map();
for (const scan of data || []) {
  const key_ = artifactKey(scan.extension_id, scan.version);
  if (!candidates.has(key_)) candidates.set(key_, scan);
}

const scanIds = [];
const scoreSchemas = new Set();
const mismatches = [];
for (const wanted of expected) {
  const key_ = artifactKey(wanted.extension_id, wanted.version);
  const actual = candidates.get(key_);
  if (!actual) {
    mismatches.push(`${key_}: no current-build publication`);
    continue;
  }
  const checks = {
    artifact_sha256: [String(wanted.artifact_hash || "").toLowerCase(), String(actual.artifact_sha256 || "").toLowerCase()],
    decision: [String(wanted.decision || ""), String(actual.decision || "")],
    severity: [String(wanted.severity || ""), String(actual.severity || "")],
    analysis_status: ["complete", String(actual.analysis_status || "")],
    coverage_percent: ["100", String(actual.coverage_percent || 0)],
  };
  for (const [field, [wantedValue, actualValue]] of Object.entries(checks)) {
    if (wantedValue !== actualValue) mismatches.push(`${key_}: ${field} expected ${wantedValue}, received ${actualValue}`);
  }
  const coverage = objectValue(actual.analysis_coverage);
  const providers = objectValue(coverage.providers);
  const expectedCoverage = objectValue(wanted.analysis_coverage);
  const expectedProviders = objectValue(expectedCoverage.providers);
  for (const provider of ["semgrep", "yara", "dependency_intelligence"]) {
    if (objectValue(providers[provider]).status !== "completed") {
      mismatches.push(`${key_}: required provider ${provider} did not complete`);
    }
  }
  for (const [provider, fields] of Object.entries({
    semgrep: ["version", "ruleset_hash"],
    yara: ["version", "ruleset_hash"],
    extension_advisories: ["snapshot_version", "sha256"],
  })) {
    const expectedProvider = objectValue(expectedProviders[provider]);
    const actualProvider = objectValue(providers[provider]);
    for (const field of fields) {
      const expectedValue = String(expectedProvider[field] || "");
      const actualValue = String(actualProvider[field] || "");
      if (!expectedValue) {
        mismatches.push(`${key_}: validation report lacks ${provider} ${field}`);
      } else if (expectedValue !== actualValue) {
        mismatches.push(`${key_}: ${provider} ${field} expected ${expectedValue}, received ${actualValue}`);
      }
    }
  }
  if (coverage.required_providers_complete !== true) {
    mismatches.push(`${key_}: required provider coverage is incomplete`);
  }
  const canonicalReport = objectValue(actual.canonical_report);
  const embeddedRules = objectValue(canonicalReport.rules);
  const embeddedRuleRows = Array.isArray(embeddedRules.rules) ? embeddedRules.rules : [];
  if (String(embeddedRules.policy_version || "") !== policyVersion
    || String(embeddedRules.ruleset_version || "") !== rulesetVersion
    || embeddedRuleRows.length === 0) {
    mismatches.push(`${key_}: canonical report is missing the active policy/ruleset catalog`);
  }
  scanIds.push(String(actual.id));
  scoreSchemas.add(String(actual.score_schema_version || ""));
}

if (new Set(scanIds).size !== expected.length) mismatches.push("The publication manifest does not contain one unique scan per exact artifact.");
if (scoreSchemas.size !== 1 || ![...scoreSchemas][0]) mismatches.push("The publication manifest does not use one score schema.");
if (mismatches.length) throw new Error(`Publication validation failed:\n- ${mismatches.join("\n- ")}`);

const summary = {
  reports: scanIds.length,
  scanner_build: scannerBuild,
  policy_version: policyVersion,
  ruleset_version: rulesetVersion,
  score_schema_version: [...scoreSchemas][0],
  accuracy_gate_corpus_id: String(accuracyGate.corpus_id),
  accuracy_gate_corpus_version: String(accuracyGate.corpus_version),
  accuracy_gate_sha256: accuracyGateSha256,
};
if (!apply) {
  console.log(JSON.stringify({ ...summary, status: "validated-dry-run" }, null, 2));
  process.exit(0);
}

const activated = await db.rpc("activate_scan_publication_release", {
  p_policy_version: policyVersion,
  p_ruleset_version: rulesetVersion,
  p_score_schema_version: [...scoreSchemas][0],
  p_scanner_build: scannerBuild,
  p_expected_reports: scanIds.length,
  p_scan_ids: scanIds,
  p_accuracy_gate_corpus_id: String(accuracyGate.corpus_id),
  p_accuracy_gate_corpus_version: String(accuracyGate.corpus_version),
  p_accuracy_gate_sha256: accuracyGateSha256,
});
if (activated.error) throw activated.error;
console.log(JSON.stringify({ ...summary, status: "activated", release_id: activated.data?.id }, null, 2));

function valueAfter(flag) {
  const index = arguments_.indexOf(flag);
  return index >= 0 ? arguments_[index + 1] : "";
}

function artifactKey(extensionId, version) {
  return `${String(extensionId || "").toLowerCase()}@${String(version || "")}`;
}

function objectValue(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
