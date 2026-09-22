import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { assertAccuracyGate } from "./accuracy-gate.mjs";
import { validatePublicationManifest } from "./publication-manifest.mjs";
import { cloudflarePublicationMismatches } from "./cloudflare-publication-revalidation.mjs";
import { chunkedCloudflareScanIds, mergeChunkedCloudflareReports } from "./cloudflare-report-storage.mjs";

const args = process.argv.slice(2);
const reportPath = valueAfter("--report");
const accuracyGatePath = valueAfter("--accuracy-gate");
const scanDatabase = process.env.CLOUDFLARE_SCAN_DATABASE || "abscissa-scan-data";
const apply = args.includes("--apply");
if (!reportPath || !accuracyGatePath) throw new Error("--report and --accuracy-gate are required");
const report = JSON.parse(await readFile(reportPath, "utf8"));
const accuracyGateBytes = await readFile(accuracyGatePath);
const accuracyGate = JSON.parse(accuracyGateBytes.toString("utf8"));
const extensions = Array.isArray(report.extensions) ? report.extensions : [];
validatePublicationManifest(extensions);
const scannerBuild = String(report.scanner_build || "");
const policyVersion = String(report.policy_version || "");
const rulesetVersion = String(report.ruleset_version || "");
const scoreSchemaVersion = String(report.score_schema_version || "");
if (!extensions.length || !/^[0-9a-f]{40}$/.test(scannerBuild) || !policyVersion || !rulesetVersion || !scoreSchemaVersion) {
  throw new Error("The Cloudflare validation report has no complete release identity.");
}
for (const item of extensions) {
  if (String(item.policy_version || "") !== policyVersion
    || String(item.ruleset_version || "") !== rulesetVersion
    || String(item.score_schema_version || "") !== scoreSchemaVersion) {
    throw new Error(`Cloudflare publication member identity does not match the release for ${String(item?.extension_id || "unknown")}@${String(item?.version || "")}.`);
  }
  const runtime = item && typeof item.runtime_contract === "object" && !Array.isArray(item.runtime_contract)
    ? item.runtime_contract
    : {};
  const notApplicable = runtime.required === false
    && runtime.provider_status === "not-applicable"
    && runtime.executed === false
    && runtime.execution === "policy-gated"
    && runtime.runtime_policy === "capability-gated-v1"
    && runtime.external_syscall_trace === false
    && runtime.external_syscall_trace_available === true;
  const completed = runtime.required === true
    && runtime.provider_status === "completed"
    && runtime.executed === true
    && runtime.execution === "controlled-bubblewrap"
    && runtime.runtime_policy === "capability-gated-v1"
    && runtime.external_syscall_trace === true
    && runtime.external_syscall_trace_available === true;
  if (runtime.profile !== "deep"
    || runtime.analysis_status !== "complete"
    || runtime.coverage_status !== "complete"
    || (!completed && !notApplicable)) {
    throw new Error(`Cloudflare validation report is missing the per-extension runtime contract for ${String(item?.extension_id || "unknown")}.`);
  }
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
const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;
if (apply) {
  const scanIds = extensions.map((item) => String(item.scan_id || "")).filter(Boolean);
  const sql = `
    select r.scan_id,r.extension_id,r.version,r.artifact_sha256,r.report_json,
           j.status as job_status,j.scan_purpose,j.expected_scanner_build,
           j.extension_id as job_extension_id,j.version as job_version
    from app_scan_reports r
    join app_scan_jobs j on j.id=r.job_id
    where r.scan_id in (${scanIds.map(quote).join(",")})
  `;
  const raw = execFileSync("npx", ["wrangler", "d1", "execute", scanDatabase, "--remote", "--command", sql, "--json"], {
    encoding: "utf8",
    maxBuffer: 128 * 1024 * 1024,
  });
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Cloudflare activation could not parse the remote D1 revalidation response: ${error instanceof Error ? error.message : String(error)}`);
  }
  const inlineRows = Array.isArray(payload?.[0]?.results) ? payload[0].results : [];
  const chunkRows = [];
  for (const scanIds of batches(chunkedCloudflareScanIds(inlineRows), 100)) {
    const chunkSql = `
      select scan_id,chunk_index,content
      from app_scan_report_chunks
      where scan_id in (${scanIds.map(quote).join(",")})
      order by scan_id,chunk_index
    `;
    const chunkPayload = JSON.parse(execFileSync("npx", ["wrangler", "d1", "execute", scanDatabase, "--remote", "--command", chunkSql, "--json"], {
      encoding: "utf8",
      maxBuffer: 128 * 1024 * 1024,
    }));
    if (Array.isArray(chunkPayload?.[0]?.results)) chunkRows.push(...chunkPayload[0].results);
  }
  const rows = mergeChunkedCloudflareReports(inlineRows, chunkRows);
  const mismatches = cloudflarePublicationMismatches({ extensions, rows, scannerBuild });
  if (mismatches.length) throw new Error(`Cloudflare activation revalidation failed:\n- ${mismatches.join("\n- ")}`);
}
const releaseId = `d1-${Date.now()}-${scannerBuild.slice(0, 12)}-${randomUUID().slice(0, 8)}`;
const now = new Date().toISOString();
const statements = [
  // D1's remote SQL endpoint rejects BEGIN/COMMIT wrappers. Stage the release
  // inactive first, then add every immutable member, and flip active last.
  `INSERT INTO app_scan_publication_releases(id,policy_version,ruleset_version,score_schema_version,scanner_build,accuracy_gate_corpus_id,accuracy_gate_corpus_version,accuracy_gate_sha256,expected_reports,report_count_at_activation,active,created_at,activated_at) VALUES(${quote(releaseId)},${quote(policyVersion)},${quote(rulesetVersion)},${quote(scoreSchemaVersion)},${quote(scannerBuild)},${quote(String(accuracyGate.corpus_id))},${quote(String(accuracyGate.corpus_version))},${quote(accuracyGateSha256)},${extensions.length},${extensions.length},0,${quote(now)},NULL);`,
  ...extensions.map((item) => `INSERT INTO app_scan_publication_release_reports(release_id,scan_id,extension_id,version,artifact_sha256) VALUES(${quote(releaseId)},${quote(item.scan_id)},${quote(item.extension_id)},${quote(item.version)},${quote(item.artifact_hash)});`),
  "UPDATE app_scan_publication_releases SET active=0 WHERE active=1;",
  `UPDATE app_scan_publication_releases SET active=1,activated_at=${quote(now)} WHERE id=${quote(releaseId)};`,
];
const summary = { release_id: releaseId, reports: extensions.length, scanner_build: scannerBuild, policy_version: policyVersion, ruleset_version: rulesetVersion, score_schema_version: scoreSchemaVersion, accuracy_gate_corpus_id: String(accuracyGate.corpus_id), accuracy_gate_corpus_version: String(accuracyGate.corpus_version), accuracy_gate_sha256: accuracyGateSha256, holdout_safe_evaluated: accuracyGate.holdout.safe_evaluated, holdout_malicious_evaluated: accuracyGate.holdout.malicious_evaluated, holdout_safe_review_rate: accuracyGate.holdout.safe_review_rate, holdout_malicious_detection_rate: accuracyGate.holdout.malicious_detection_rate };
if (!apply) {
  console.log(JSON.stringify({ ...summary, status: "validated-dry-run" }, null, 2));
  process.exit(0);
}

const temp = await mkdtemp(join("/tmp", "guardrails-d1-publication-"));
const sqlPath = join(temp, "activate.sql");
try {
  await writeFile(sqlPath, `${statements.join("\n")}\n`, "utf8");
  execFileSync("npx", ["wrangler", "d1", "execute", scanDatabase, "--remote", "--file", sqlPath], { stdio: "inherit" });
} finally {
  await rm(temp, { recursive: true, force: true });
}
console.log(JSON.stringify({ ...summary, status: "activated" }, null, 2));

function valueAfter(flag) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : "";
}

function batches(values, size) {
  const result = [];
  for (let index = 0; index < values.length; index += size) result.push(values.slice(index, index + size));
  return result;
}
