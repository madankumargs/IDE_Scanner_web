import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { assertAccuracyGate } from "./accuracy-gate.mjs";
import { MAX_PUBLICATION_REPORTS, validatePublicationManifest } from "./publication-manifest.mjs";
import { publicCanonicalMismatch, singleExtensionDetail } from "./publication-canonical.mjs";
import { publicationRuntimeMismatch } from "./publication-runtime.mjs";

const args = process.argv.slice(2);
const scannerBuild = valueAfter("--scanner-build");
const output = valueAfter("--out");
const expectedReports = Number(valueAfter("--expected-reports") || 100);
const accuracyGatePath = valueAfter("--accuracy-gate");
if (!/^[0-9a-f]{40}$/.test(scannerBuild) || !output || !accuracyGatePath || !Number.isSafeInteger(expectedReports) || expectedReports < 1 || expectedReports > MAX_PUBLICATION_REPORTS) {
  throw new Error(`--scanner-build, --out, --accuracy-gate, and --expected-reports between 1 and ${MAX_PUBLICATION_REPORTS} are required.`);
}
const accuracyGateBytes = await readFile(accuracyGatePath);
const accuracyGate = JSON.parse(accuracyGateBytes.toString("utf8"));
assertAccuracyGate(accuracyGate, { scanner_build: scannerBuild });

const sql = `
  select r.scan_id,r.extension_id,r.version,r.artifact_sha256,r.created_at,r.report_json
  from app_scan_reports r
  join app_scan_jobs j on j.id = r.job_id
  where json_extract(r.report_json,'$.metadata.scanner_build')='${scannerBuild}'
    and j.scan_purpose in ('public_intelligence','benchmark')
  order by r.created_at desc
`;
const payload = JSON.parse(execFileSync("npx", ["wrangler", "d1", "execute", "abscissa-registry", "--remote", "--command", sql, "--json"], {
  encoding: "utf8",
  maxBuffer: 128 * 1024 * 1024,
}));
const rows = Array.isArray(payload?.[0]?.results) ? payload[0].results : [];
const selected = new Map();
const failures = [];
for (const row of rows) {
  let bundle;
  try {
    bundle = JSON.parse(String(row.report_json || ""));
  } catch {
    failures.push(`${key(row)}: report JSON is invalid`);
    continue;
  }
  const metadata = object(bundle.metadata);
  const detail = singleExtensionDetail(bundle.extensions);
  const coverage = object(detail.analysis_coverage);
  const identity = object(detail.artifact_identity);
  const rules = object(bundle.rules);
  const ruleRows = Array.isArray(rules.rules) ? rules.rules : [];
  const canonicalMismatch = publicCanonicalMismatch({
    reportedSchemaVersion: metadata.schema_version,
    detail,
    metadata,
    expectedScannerBuild: scannerBuild,
    expectedExtensionId: row.extension_id,
    expectedVersion: row.version,
  });
  const runtimeMismatch = publicationRuntimeMismatch({
    profile: metadata.profile,
    metadata,
    analysisCoverage: coverage,
  });
  if (canonicalMismatch
    || String(metadata.scanner_build || "") !== scannerBuild
    || String(detail.analysis_status || "") !== "complete"
    || coverage.status !== "complete"
    || coverage.required_providers_complete !== true
    || String(identity.sha256 || "").length !== 64
    || String(row.artifact_sha256 || "").toLowerCase() !== String(identity.sha256 || "").toLowerCase()
    || String(rules.policy_version || "") !== String(metadata.policy_version || "")
    || String(rules.ruleset_version || "") !== String(metadata.ruleset_version || "")
    || ruleRows.length === 0
    || runtimeMismatch) {
    failures.push(`${key(row)}: ${canonicalMismatch || runtimeMismatch || "report failed immutable publication checks"}`);
    continue;
  }
  const candidate = {
    extension_id: String(row.extension_id || detail.extension_id || ""),
    version: String(row.version || detail.version || ""),
    artifact_hash: String(identity.sha256),
    decision: String(detail.decision || ""),
    severity: String(detail.severity || ""),
    score_schema_version: String(detail.score_schema_version || ""),
    policy_version: String(metadata.policy_version || ""),
    ruleset_version: String(metadata.ruleset_version || ""),
    scan_id: String(row.scan_id || ""),
    runtime_contract: {
      profile: String(metadata.profile || ""),
      analysis_status: String(detail.analysis_status || ""),
      coverage_status: String(coverage.status || ""),
      required: Boolean(objectValue(coverage.providers).dynamic_sandbox?.required),
      provider_status: String(objectValue(coverage.providers).dynamic_sandbox?.status || ""),
      execution: String(objectValue(coverage.providers).dynamic_sandbox?.execution || ""),
      runtime_policy: String(objectValue(coverage.providers).dynamic_sandbox?.policy || ""),
      executed: Boolean(objectValue(coverage.providers).dynamic_sandbox?.executed),
      external_syscall_trace: Boolean(objectValue(coverage.providers).dynamic_sandbox?.external_syscall_trace),
      external_syscall_trace_available: Boolean(objectValue(metadata.intelligence_snapshot).dynamic_sandbox?.external_syscall_trace_available),
    },
  };
  if (!candidate.extension_id || !candidate.version || !candidate.score_schema_version || !candidate.scan_id) {
    failures.push(`${key(row)}: report is missing release identity`);
    continue;
  }
  const exactKey = `${candidate.extension_id.toLowerCase()}@${candidate.version}`;
  if (!selected.has(exactKey)) selected.set(exactKey, candidate);
}

if (failures.length) throw new Error(`Cloudflare publication manifest cannot be built:\n- ${failures.join("\n- ")}`);
const extensions = [...selected.values()].sort((left, right) => `${left.extension_id}@${left.version}`.localeCompare(`${right.extension_id}@${right.version}`));
if (extensions.length !== expectedReports) throw new Error(`Expected ${expectedReports} unique reports, found ${extensions.length}.`);
const identities = new Set(extensions.map((row) => `${row.policy_version}\u0000${row.ruleset_version}\u0000${row.score_schema_version}`));
if (identities.size !== 1) throw new Error("Cloudflare publication reports do not share one policy, ruleset, and score schema.");
const first = extensions[0];
assertAccuracyGate(accuracyGate, {
  scanner_build: scannerBuild,
  policy_version: first.policy_version,
  ruleset_version: first.ruleset_version,
});
const accuracyGateSha256 = createHash("sha256").update(accuracyGateBytes).digest("hex");
const validation = {
  scanner_build: scannerBuild,
  policy_version: first.policy_version,
  ruleset_version: first.ruleset_version,
  score_schema_version: first.score_schema_version,
  accuracy_gate_sha256: accuracyGateSha256,
  accuracy_gate: {
    corpus_id: String(accuracyGate.corpus_id),
    corpus_version: String(accuracyGate.corpus_version),
    scanner_build: String(accuracyGate.report_identity.scanner_build),
    required_pass_rate: accuracyGate.summary.required_pass_rate,
    safe_block_rate: accuracyGate.summary.safe_block_rate,
    safe_review_rate: accuracyGate.holdout.safe_review_rate,
    max_safe_review_rate: accuracyGate.holdout.max_safe_review_rate ?? 0.2,
    malicious_allow_rate: accuracyGate.summary.malicious_allow_rate,
    malicious_detection_rate: accuracyGate.holdout.malicious_detection_rate,
    holdout_status: String(accuracyGate.holdout.status),
    holdout_safe_evaluated: accuracyGate.holdout.safe_evaluated,
    holdout_malicious_evaluated: accuracyGate.holdout.malicious_evaluated,
  },
  extensions,
};
validatePublicationManifest(validation.extensions);
await writeFile(output, `${JSON.stringify(validation, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ output, reports: extensions.length, policy_version: first.policy_version, ruleset_version: first.ruleset_version }, null, 2));

function valueAfter(flag) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : "";
}

function key(row) {
  return `${String(row.extension_id || "").toLowerCase()}@${String(row.version || "")}`;
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
