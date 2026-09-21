import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

const DEFAULT_BUILD = "02a0f71f61cd5b214f2d4785db876035d79b7d9c";
const DEFAULT_MAX_PART_BYTES = 40_000_000;

function sqlString(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

export function buildSubsetSql(sourceDb, scannerBuild = DEFAULT_BUILD) {
  const source = path.resolve(sourceDb);
  const build = String(scannerBuild).trim();
  if (!/^[0-9a-f]{40}$/i.test(build)) throw new Error(`Invalid scanner build: ${build}`);

  return `
PRAGMA journal_mode=OFF;
PRAGMA synchronous=OFF;
ATTACH DATABASE ${sqlString(source)} AS src;

-- Preserve identities and private application state before dependent rows.
CREATE TABLE app_users AS SELECT * FROM src.app_users;
CREATE TABLE app_profiles AS SELECT * FROM src.app_profiles;
CREATE TABLE app_sessions AS SELECT * FROM src.app_sessions;
CREATE TABLE app_teams AS SELECT * FROM src.app_teams;
CREATE TABLE app_team_members AS SELECT * FROM src.app_team_members;
CREATE TABLE app_team_state AS SELECT * FROM src.app_team_state;
CREATE TABLE app_team_invitations AS SELECT * FROM src.app_team_invitations;
CREATE TABLE app_guest_scan_trials AS SELECT * FROM src.app_guest_scan_trials;
CREATE TABLE app_ai_usage AS SELECT * FROM src.app_ai_usage;
CREATE TABLE app_email_auth_codes AS SELECT * FROM src.app_email_auth_codes;
CREATE TABLE feedback_submissions AS SELECT * FROM src.feedback_submissions;

-- Keep the active public queue and all non-public user/team jobs. A scan
-- database migration must not carry the historical public report archive.
CREATE TABLE app_scan_jobs AS
  SELECT * FROM src.app_scan_jobs
  WHERE expected_scanner_build = ${sqlString(build)}
     OR COALESCE(scan_purpose, '') <> 'public_intelligence';

-- Jobs that were only lost because the old database filled up are safe to
-- retry now that scan state is isolated and reports are bounded. Real scan
-- failures remain visible for review instead of being silently retried.
UPDATE app_scan_jobs
SET status='queued', lifecycle_stage='queued', github_run_id=NULL, runner_id=NULL,
    error=NULL, callback_error=NULL, started_at=NULL, result_received_at=NULL,
    completed_at=NULL, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'), last_event_at=NULL
WHERE expected_scanner_build = ${sqlString(build)}
  AND status = 'running';
UPDATE app_scan_jobs
SET status='queued', lifecycle_stage='queued', github_run_id=NULL, runner_id=NULL,
    error=NULL, callback_error=NULL, started_at=NULL, result_received_at=NULL,
    completed_at=NULL, updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'), last_event_at=NULL
WHERE expected_scanner_build = ${sqlString(build)}
  AND status = 'failed'
  AND (error LIKE 'D1_ERROR:%' OR callback_error LIKE 'D1_ERROR:%');

CREATE TABLE app_scan_reports AS
  SELECT r.* FROM src.app_scan_reports r
  JOIN app_scan_jobs j ON j.id = r.job_id;
CREATE TABLE app_scan_job_events AS
  SELECT e.* FROM src.app_scan_job_events e
  JOIN app_scan_jobs j ON j.id = e.job_id;
CREATE TABLE app_scan_job_subscribers AS
  SELECT s.* FROM src.app_scan_job_subscribers s
  JOIN app_scan_jobs j ON j.id = s.job_id;
CREATE TABLE app_scan_runner_status AS SELECT * FROM src.app_scan_runner_status;
CREATE TABLE app_scan_publication_releases AS
  SELECT * FROM src.app_scan_publication_releases WHERE active = 1;
CREATE TABLE app_scan_publication_release_reports AS
  SELECT rr.* FROM src.app_scan_publication_release_reports rr
  JOIN app_scan_publication_releases r ON r.id = rr.release_id
  JOIN app_scan_reports sr ON sr.scan_id = rr.scan_id;
CREATE TABLE app_guest_scan_access AS
  SELECT a.* FROM src.app_guest_scan_access a
  JOIN app_scan_jobs j ON j.id = a.job_id;
CREATE TABLE app_team_badges AS
  SELECT b.* FROM src.app_team_badges b
  WHERE (b.scan_id IS NULL OR EXISTS (SELECT 1 FROM app_scan_reports r WHERE r.scan_id = b.scan_id))
    AND (b.scan_job_id IS NULL OR EXISTS (SELECT 1 FROM app_scan_jobs j WHERE j.id = b.scan_job_id));
CREATE TABLE app_notification_deliveries AS SELECT * FROM src.app_notification_deliveries;

DETACH DATABASE src;
VACUUM;
`;
}

function parseFlag(args, name, fallback = "") {
  const index = args.indexOf(name);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

function runSqlite(database, sql) {
  const result = spawnSync("sqlite3", [database], { input: sql, encoding: "utf8", maxBuffer: 1024 * 1024 });
  if (result.status !== 0) {
    throw new Error(`sqlite3 failed for ${database}: ${result.stderr || result.stdout || `exit ${result.status}`}`);
  }
}

function ensureEmptyDatabase(database) {
  if (fs.existsSync(database)) throw new Error(`Refusing to overwrite existing database: ${database}`);
  fs.mkdirSync(path.dirname(database), { recursive: true });
}

async function dumpIntoParts(database, partsDir, maxPartBytes) {
  if (!Number.isInteger(maxPartBytes) || maxPartBytes < 1_000_000) {
    throw new Error("--max-part-bytes must be at least 1 MB.");
  }
  fs.mkdirSync(partsDir, { recursive: true });
  for (const entry of fs.readdirSync(partsDir)) {
    if (/^part-\d{4}\.sql$/.test(entry)) fs.unlinkSync(path.join(partsDir, entry));
  }

  const child = spawn("sqlite3", [database, ".dump"], { stdio: ["ignore", "pipe", "pipe"] });
  let stderr = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  const input = readline.createInterface({ input: child.stdout });
  let part = [];
  let partBytes = 0;
  let partIndex = 0;
  const files = [];

  const flush = () => {
    if (!part.length) return;
    const filePath = path.join(partsDir, `part-${String(partIndex).padStart(4, "0")}.sql`);
    fs.writeFileSync(filePath, `${part.join("\n")}\n`);
    files.push({ path: filePath, bytes: fs.statSync(filePath).size, statements: part.length });
    partIndex += 1;
    part = [];
    partBytes = 0;
  };

  for await (const line of input) {
    if (!/^INSERT INTO "?(?:app_|feedback_submissions)/.test(line)) continue;
    const bytes = Buffer.byteLength(line) + 1;
    if (bytes > maxPartBytes) throw new Error(`A single insert exceeds the part limit (${bytes} bytes).`);
    if (part.length && partBytes + bytes > maxPartBytes) flush();
    part.push(line);
    partBytes += bytes;
  }
  flush();

  const exitCode = await new Promise((resolve) => child.once("close", resolve));
  if (exitCode !== 0) throw new Error(`sqlite3 dump failed: ${stderr || `exit ${exitCode}`}`);
  if (!files.length) throw new Error("No application rows were found in the migration subset.");
  return files;
}

export async function buildScanMigration({ sourceDb, outputDb, partsDir, scannerBuild = DEFAULT_BUILD, maxPartBytes = DEFAULT_MAX_PART_BYTES }) {
  ensureEmptyDatabase(outputDb);
  runSqlite(outputDb, buildSubsetSql(sourceDb, scannerBuild));
  const files = await dumpIntoParts(outputDb, partsDir, maxPartBytes);
  const counts = spawnSync("sqlite3", [outputDb, "SELECT 'jobs',COUNT(*) FROM app_scan_jobs UNION ALL SELECT 'reports',COUNT(*) FROM app_scan_reports UNION ALL SELECT 'queued',COUNT(*) FROM app_scan_jobs WHERE status='queued';"], { encoding: "utf8" });
  if (counts.status !== 0) throw new Error(`Could not validate migration subset: ${counts.stderr || counts.stdout}`);
  return { sourceDb, outputDb, partsDir, scannerBuild, files, counts: counts.stdout.trim().split("\n") };
}

async function main() {
  const args = process.argv.slice(2);
  const sourceDb = parseFlag(args, "--source-db", ".tmp/registry-export.db");
  const outputDb = parseFlag(args, "--output-db", ".tmp/scan-subset.db");
  const partsDir = parseFlag(args, "--parts-dir", ".tmp/scan-import");
  const scannerBuild = parseFlag(args, "--scanner-build", DEFAULT_BUILD);
  const maxPartBytes = Number(parseFlag(args, "--max-part-bytes", String(DEFAULT_MAX_PART_BYTES)));
  const result = await buildScanMigration({ sourceDb, outputDb, partsDir, scannerBuild, maxPartBytes });
  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
