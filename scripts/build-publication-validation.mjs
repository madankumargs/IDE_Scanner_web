import { execFileSync } from "node:child_process";
import { writeFile } from "node:fs/promises";

const args = process.argv.slice(2);
const scannerBuild = valueAfter("--scanner-build");
const output = valueAfter("--out");
if (!/^[0-9a-f]{40}$/.test(scannerBuild) || !output) {
  throw new Error("--scanner-build must be a full commit SHA and --out is required.");
}

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
    and s.scanner_build = '${scannerBuild}'
    and s.analysis_status = 'complete'
    and s.superseded_at is null
  order by s.extension_id,s.version,s.scanned_at desc;
`;

const raw = execFileSync("npx", ["supabase@latest", "db", "query", "--linked", "--output-format", "json", sql], {
  encoding: "utf8",
  maxBuffer: 64 * 1024 * 1024,
});
const envelope = JSON.parse(raw.slice(raw.indexOf("{")));
const rows = Array.isArray(envelope.rows) ? envelope.rows : [];
const selected = new Map();
const failures = [];
for (const row of rows) {
  const key = `${String(row.extension_id || "").toLowerCase()}@${String(row.version || "")}`;
  const report = object(row.canonical_report);
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
const identities = new Set(selectedRows.map((row) => `${row.policy_version}\u0000${row.ruleset_version}\u0000${row.score_schema_version}`));
if (identities.size !== 1) throw new Error("Replacement cohort does not use one policy, ruleset, and score schema.");
const identity = selectedRows[0];
const validation = {
  scanner_build: scannerBuild,
  policy_version: String(identity.policy_version || ""),
  ruleset_version: String(identity.ruleset_version || ""),
  score_schema_version: String(identity.score_schema_version || ""),
  extensions: selectedRows.map((row) => ({
    extension_id: String(row.extension_id),
    version: String(row.version),
    artifact_hash: String(row.artifact_sha256 || ""),
    decision: String(row.decision || ""),
    severity: String(row.severity || ""),
    analysis_coverage: object(row.analysis_coverage),
  })),
};
await writeFile(output, `${JSON.stringify(validation, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ output, reports: validation.extensions.length, policy_version: validation.policy_version, ruleset_version: validation.ruleset_version }, null, 2));

function valueAfter(flag) {
  const index = args.indexOf(flag);
  return index >= 0 ? args[index + 1] : "";
}

function object(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}
