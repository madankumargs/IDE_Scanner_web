import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { Client } from "pg";
import { assertAccuracyGate } from "./accuracy-gate.mjs";
import { validatePublicationManifest } from "./publication-manifest.mjs";
import { publicCanonicalMismatch, singleExtensionDetail } from "./publication-canonical.mjs";
import { publicationRuntimeMismatch } from "./publication-runtime.mjs";

const args = process.argv.slice(2);
const scannerBuild = valueAfter("--scanner-build");
const output = valueAfter("--out");
const accuracyGatePath = valueAfter("--accuracy-gate");
const expectedReports = integerAfter("--expected-reports");
if (!/^[0-9a-f]{40}$/.test(scannerBuild) || !output || !accuracyGatePath || !Number.isSafeInteger(expectedReports) || expectedReports < 1 || expectedReports > 10_000) {
  throw new Error("--scanner-build must be a full commit SHA, --expected-reports between 1 and 10000, --out, and --accuracy-gate are required.");
}
const accuracyGateBytes = await readFile(accuracyGatePath);
const accuracyGate = JSON.parse(accuracyGateBytes.toString("utf8"));
assertAccuracyGate(accuracyGate, { scanner_build: scannerBuild });

const sql = `
  with active as (
    select distinct s.extension_id, s.version
    from scan_publication_release_scans r
    join scans s on s.id = r.scan_id
    join scan_publication_releases p on p.id = r.release_id
    where p.active = true
  )
  select s.extension_id,s.version,s.artifact_sha256,s.decision,s.severity,
         s.analysis_status,s.coverage_percent,s.analysis_coverage,
         s.policy_version,s.ruleset_version,s.score_schema_version,
         s.scanner_build,s.scanned_at,s.canonical_report
  from active a
  join scans s on s.extension_id = a.extension_id and s.version = a.version
  where s.scan_purpose = 'public_intelligence'
    and s.scanner_build = $1
    and s.analysis_status = 'complete'
    and s.superseded_at is null
  order by s.extension_id,s.version,s.scanned_at desc;
`;

const client = new Client({ connectionString: databaseConnectionString() });
await client.connect();
let rows;
try {
  rows = (await client.query(sql, [scannerBuild])).rows;
} finally {
  await client.end();
}
const selected = new Map();
const failures = [];
for (const row of rows) {
  const key = `${String(row.extension_id || "").toLowerCase()}@${String(row.version || "")}`;
  const report = object(row.canonical_report);
  const detail = singleExtensionDetail(report.extensions);
  const canonicalMismatch = publicCanonicalMismatch({
    reportedSchemaVersion: object(report.metadata).schema_version,
    detail,
    metadata: object(report.metadata),
    expectedScannerBuild: scannerBuild,
    expectedExtensionId: row.extension_id,
    expectedVersion: row.version,
  });
  const runtimeMismatch = publicationRuntimeMismatch({
    profile: object(report.metadata).profile,
    metadata: object(report.metadata),
    analysisCoverage: row.analysis_coverage,
  });
  if (canonicalMismatch || runtimeMismatch) {
    failures.push(`${key}: ${canonicalMismatch || runtimeMismatch}`);
    continue;
  }
  const rules = object(report.rules);
  const ruleRows = Array.isArray(rules.rules) ? rules.rules : [];
  if (String(rules.policy_version || "") !== String(row.policy_version || "")
    || String(rules.ruleset_version || "") !== String(row.ruleset_version || "")
    || ruleRows.length === 0) {
    failures.push(`${key}: canonical report has no matching embedded rule catalog`);
    continue;
  }
  if (!selected.has(key)) selected.set(key, row);
}

if (failures.length) throw new Error(`Publication manifest cannot be built:\n- ${failures.join("\n- ")}`);
const selectedRows = [...selected.values()];
if (!selectedRows.length) throw new Error("Publication manifest contains no complete reports.");
if (selectedRows.length !== expectedReports) {
  throw new Error(`Publication manifest contains ${selectedRows.length} complete reports; ${expectedReports} required.`);
}
const identities = new Set(selectedRows.map((row) => `${row.policy_version}\u0000${row.ruleset_version}\u0000${row.score_schema_version}`));
if (identities.size !== 1) throw new Error("Replacement cohort does not use one policy, ruleset, and score schema.");
const identity = selectedRows[0];
assertAccuracyGate(accuracyGate, {
  scanner_build: scannerBuild,
  policy_version: String(identity.policy_version || ""),
  ruleset_version: String(identity.ruleset_version || ""),
});
const accuracyGateSha256 = createHash("sha256").update(accuracyGateBytes).digest("hex");
const validation = {
  scanner_build: scannerBuild,
  policy_version: String(identity.policy_version || ""),
  ruleset_version: String(identity.ruleset_version || ""),
  score_schema_version: String(identity.score_schema_version || ""),
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
  extensions: selectedRows.map((row) => ({
    extension_id: String(row.extension_id),
    version: String(row.version),
    artifact_hash: String(row.artifact_sha256 || ""),
    decision: String(row.decision || ""),
    severity: String(row.severity || ""),
    analysis_coverage: object(row.analysis_coverage),
  })),
};
validatePublicationManifest(validation.extensions, { requireScanId: false });
await writeFile(output, `${JSON.stringify(validation, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ output, reports: validation.extensions.length, policy_version: validation.policy_version, ruleset_version: validation.ruleset_version }, null, 2));

function valueAfter(flag) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : "";
}

function integerAfter(flag) {
  const value = Number(valueAfter(flag));
  return Number.isSafeInteger(value) ? value : NaN;
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function databaseConnectionString() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const password = String(process.env.SUPABASE_PASSWORD || "").trim();
  if (!password) throw new Error("DATABASE_URL or SUPABASE_PASSWORD is required for Supabase publication validation.");
  return `postgresql://postgres.kmdujtabqaxgoeltbxpq:${encodeURIComponent(password)}@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres?uselibpqcompat=true&sslmode=require`;
}

