import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { assertAccuracyGate } from "./accuracy-gate.mjs";

const args = process.argv.slice(2);
const reportPath = valueAfter("--report");
const accuracyGatePath = valueAfter("--accuracy-gate");
const apply = args.includes("--apply");
if (!reportPath || !accuracyGatePath) throw new Error("--report and --accuracy-gate are required");
const report = JSON.parse(await readFile(reportPath, "utf8"));
const accuracyGateBytes = await readFile(accuracyGatePath);
const accuracyGate = JSON.parse(accuracyGateBytes.toString("utf8"));
const extensions = Array.isArray(report.extensions) ? report.extensions : [];
const scannerBuild = String(report.scanner_build || "");
const policyVersion = String(report.policy_version || "");
const rulesetVersion = String(report.ruleset_version || "");
const scoreSchemaVersion = String(report.score_schema_version || "");
if (!extensions.length || !/^[0-9a-f]{40}$/.test(scannerBuild) || !policyVersion || !rulesetVersion || !scoreSchemaVersion) {
  throw new Error("The Cloudflare validation report has no complete release identity.");
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
const releaseId = `d1-${Date.now()}-${scannerBuild.slice(0, 12)}-${randomUUID().slice(0, 8)}`;
const now = new Date().toISOString();
const quote = (value) => `'${String(value).replaceAll("'", "''")}'`;
const statements = [
  // D1's remote SQL endpoint rejects BEGIN/COMMIT wrappers. Stage the release
  // inactive first, then add every immutable member, and flip active last.
  `INSERT INTO app_scan_publication_releases(id,policy_version,ruleset_version,score_schema_version,scanner_build,accuracy_gate_corpus_id,accuracy_gate_corpus_version,accuracy_gate_sha256,expected_reports,report_count_at_activation,active,created_at,activated_at) VALUES(${quote(releaseId)},${quote(policyVersion)},${quote(rulesetVersion)},${quote(scoreSchemaVersion)},${quote(scannerBuild)},${quote(String(accuracyGate.corpus_id))},${quote(String(accuracyGate.corpus_version))},${quote(accuracyGateSha256)},${extensions.length},${extensions.length},0,${quote(now)},NULL);`,
  ...extensions.map((item) => `INSERT INTO app_scan_publication_release_reports(release_id,scan_id,extension_id,version,artifact_sha256) VALUES(${quote(releaseId)},${quote(item.scan_id)},${quote(item.extension_id)},${quote(item.version)},${quote(item.artifact_hash)});`),
  "UPDATE app_scan_publication_releases SET active=0 WHERE active=1;",
  `UPDATE app_scan_publication_releases SET active=1,activated_at=${quote(now)} WHERE id=${quote(releaseId)};`,
];
const summary = { release_id: releaseId, reports: extensions.length, scanner_build: scannerBuild, policy_version: policyVersion, ruleset_version: rulesetVersion, score_schema_version: scoreSchemaVersion, accuracy_gate_corpus_id: String(accuracyGate.corpus_id), accuracy_gate_corpus_version: String(accuracyGate.corpus_version), accuracy_gate_sha256: accuracyGateSha256 };
if (!apply) {
  console.log(JSON.stringify({ ...summary, status: "validated-dry-run" }, null, 2));
  process.exit(0);
}

const temp = await mkdtemp(join("/tmp", "guardrails-d1-publication-"));
const sqlPath = join(temp, "activate.sql");
try {
  await writeFile(sqlPath, `${statements.join("\n")}\n`, "utf8");
  execFileSync("npx", ["wrangler", "d1", "execute", "abscissa-registry", "--remote", "--file", sqlPath], { stdio: "inherit" });
} finally {
  await rm(temp, { recursive: true, force: true });
}
console.log(JSON.stringify({ ...summary, status: "activated" }, null, 2));

function valueAfter(flag) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : "";
}
