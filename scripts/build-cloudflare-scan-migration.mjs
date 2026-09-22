import fs from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

const DEFAULT_BUILD = "02a0f71f61cd5b214f2d4785db876035d79b7d9c";
const DEFAULT_MAX_PART_BYTES = 40_000_000;
const DEFAULT_MAX_PART_STATEMENTS = 500;
const MAX_STORED_PREVIEWS = 12;
const MAX_STORED_PREVIEW_CHARS = 32_768;
const MAX_STORED_FILE_ROWS = 2_000;
const MAX_INLINE_REPORT_CHARS = 80_000;
const REPORT_CHUNK_CHARS = 100_000;

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
CREATE INDEX app_scan_reports_scan_idx ON app_scan_reports(scan_id);
CREATE TABLE app_scan_report_chunks (
  scan_id TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  content TEXT NOT NULL,
  PRIMARY KEY (scan_id, chunk_index)
);
CREATE TABLE app_scan_report_previews (
  scan_id TEXT NOT NULL,
  path TEXT NOT NULL,
  content TEXT NOT NULL,
  content_sha256 TEXT NOT NULL,
  truncated INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  PRIMARY KEY (scan_id, path)
);
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

function jsonObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function splitText(value) {
  if (value.length <= MAX_INLINE_REPORT_CHARS) return [value];
  const chunks = [];
  for (let index = 0; index < value.length;) {
    let end = Math.min(index + REPORT_CHUNK_CHARS, value.length);
    if (end < value.length && value.charCodeAt(end - 1) >= 0xd800 && value.charCodeAt(end - 1) <= 0xdbff) end -= 1;
    chunks.push(value.slice(index, end));
    index = end;
  }
  return chunks;
}

function compactBundle(bundle) {
  const previews = [];
  const compactDetail = (detail) => {
    const inventory = jsonObject(detail.artifact_inventory);
    const rawFiles = array(inventory.files);
    const allHashes = array(inventory._all_file_hashes);
    for (const raw of array(inventory.source_previews)) {
      if (previews.length >= MAX_STORED_PREVIEWS) break;
      const candidate = jsonObject(raw);
      const previewPath = String(candidate.path || "");
      const content = String(candidate.content || "");
      if (!previewPath || !content || previewPath.includes("\\") || previewPath.split("/").some((part) => !part || part === "." || part === "..")) continue;
      const clipped = content.slice(0, MAX_STORED_PREVIEW_CHARS);
      previews.push({
        path: previewPath,
        content: clipped,
        content_sha256: createHash("sha256").update(clipped).digest("hex"),
        truncated: Boolean(candidate.truncated) || clipped.length < content.length,
      });
    }
    const compactInventory = { ...inventory };
    delete compactInventory.source_previews;
    delete compactInventory._all_file_hashes;
    if (rawFiles.length > MAX_STORED_FILE_ROWS) {
      compactInventory.files = rawFiles.slice(0, MAX_STORED_FILE_ROWS);
      compactInventory.files_truncated = true;
    }
    compactInventory.file_count = Math.max(rawFiles.length, allHashes.length);
    return { ...detail, artifact_inventory: compactInventory };
  };
  const extensions = Array.isArray(bundle.extensions)
    ? bundle.extensions.map((detail) => compactDetail(jsonObject(detail)))
    : bundle.extensions && typeof bundle.extensions === "object"
      ? Object.fromEntries(Object.entries(bundle.extensions).map(([key, detail]) => [key, compactDetail(jsonObject(detail))]))
      : bundle.extensions;
  return { bundle: { ...bundle, extensions }, previews };
}

async function compactReportRows(database) {
  const separator = "\u001f";
  const updatesDatabase = `${database}.report-updates.sqlite`;
  if (fs.existsSync(updatesDatabase)) throw new Error(`Refusing to overwrite existing report update database: ${updatesDatabase}`);
  runSqlite(updatesDatabase, `
CREATE TABLE app_scan_reports_compact (scan_id TEXT PRIMARY KEY, report_json TEXT NOT NULL);
CREATE TABLE app_scan_report_chunks (scan_id TEXT NOT NULL, chunk_index INTEGER NOT NULL, content TEXT NOT NULL, PRIMARY KEY(scan_id, chunk_index));
CREATE TABLE app_scan_report_previews (scan_id TEXT NOT NULL, path TEXT NOT NULL, content TEXT NOT NULL, content_sha256 TEXT NOT NULL, truncated INTEGER NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(scan_id, path));
`);
  const child = spawn("sqlite3", ["-separator", separator, database, "SELECT scan_id,report_json,created_at FROM app_scan_reports ORDER BY scan_id;"], { stdio: ["ignore", "pipe", "pipe"] });
  const childExit = new Promise((resolve) => child.once("close", resolve));
  let stderr = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  const input = readline.createInterface({ input: child.stdout });
  let pending = [];
  let pendingBytes = 0;
  let reportCount = 0;
  const flush = () => {
    if (!pending.length) return;
    runSqlite(updatesDatabase, pending.join("\n"));
    pending = [];
    pendingBytes = 0;
  };
  for await (const line of input) {
    const firstSeparator = line.indexOf(separator);
    const lastSeparator = line.lastIndexOf(separator);
    if (firstSeparator <= 0 || lastSeparator <= firstSeparator) throw new Error("Could not parse the streamed scan report row.");
    const scanId = line.slice(0, firstSeparator);
    const original = JSON.parse(line.slice(firstSeparator + 1, lastSeparator));
    const createdAt = line.slice(lastSeparator + 1);
    const compacted = compactBundle(original);
    const reportJson = JSON.stringify(compacted.bundle);
    const chunks = splitText(reportJson);
    const storedReportJson = chunks.length > 1
      ? JSON.stringify({ chunked: true, chunk_count: chunks.length, sha256: createHash("sha256").update(reportJson).digest("hex") })
      : reportJson;
    const statements = [`INSERT OR REPLACE INTO app_scan_reports_compact(scan_id,report_json) VALUES(${sqlString(scanId)},${sqlString(storedReportJson)});`];
    if (chunks.length > 1) {
      chunks.forEach((content, chunkIndex) => statements.push(`INSERT INTO app_scan_report_chunks(scan_id,chunk_index,content) VALUES(${sqlString(scanId)},${chunkIndex},${sqlString(content)});`));
    }
    compacted.previews.forEach((preview) => statements.push(`INSERT OR REPLACE INTO app_scan_report_previews(scan_id,path,content,content_sha256,truncated,created_at) VALUES(${sqlString(scanId)},${sqlString(preview.path)},${sqlString(preview.content)},${sqlString(preview.content_sha256)},${preview.truncated ? 1 : 0},${sqlString(createdAt)});`));
    const text = statements.join("\n");
    const bytes = Buffer.byteLength(text) + 1;
    if (pending.length && pendingBytes + bytes > 20_000_000) flush();
    pending.push(text);
    pendingBytes += bytes;
    reportCount += 1;
  }
  const exitCode = await childExit;
  if (exitCode !== 0) throw new Error(`sqlite3 report stream failed: ${stderr || `exit ${exitCode}`}`);
  flush();
  runSqlite(database, `
ATTACH DATABASE ${sqlString(path.resolve(updatesDatabase))} AS compact;
UPDATE app_scan_reports
SET report_json=(SELECT report_json FROM compact.app_scan_reports_compact WHERE scan_id=app_scan_reports.scan_id)
WHERE scan_id IN (SELECT scan_id FROM compact.app_scan_reports_compact);
INSERT INTO app_scan_report_chunks(scan_id,chunk_index,content)
  SELECT scan_id,chunk_index,content FROM compact.app_scan_report_chunks;
INSERT OR REPLACE INTO app_scan_report_previews(scan_id,path,content,content_sha256,truncated,created_at)
  SELECT scan_id,path,content,content_sha256,truncated,created_at FROM compact.app_scan_report_previews;
DETACH DATABASE compact;
`);
  fs.unlinkSync(updatesDatabase);
  return { reports: reportCount };
}

async function dumpIntoParts(database, partsDir, maxPartBytes, maxPartStatements) {
  if (!Number.isInteger(maxPartBytes) || maxPartBytes < 1_000_000) {
    throw new Error("--max-part-bytes must be at least 1 MB.");
  }
  if (!Number.isInteger(maxPartStatements) || maxPartStatements < 100) {
    throw new Error("--max-part-statements must be at least 100.");
  }
  fs.mkdirSync(partsDir, { recursive: true });
  for (const entry of fs.readdirSync(partsDir)) {
    if (/^part-\d{4}\.sql$/.test(entry)) fs.unlinkSync(path.join(partsDir, entry));
  }

  const child = spawn("sqlite3", [database, ".dump"], { stdio: ["ignore", "pipe", "pipe"] });
  const childExit = new Promise((resolve) => child.once("close", resolve));
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
    if (part.length && (partBytes + bytes > maxPartBytes || part.length >= maxPartStatements)) flush();
    part.push(line);
    partBytes += bytes;
  }
  flush();

  const exitCode = await childExit;
  if (exitCode !== 0) throw new Error(`sqlite3 dump failed: ${stderr || `exit ${exitCode}`}`);
  if (!files.length) throw new Error("No application rows were found in the migration subset.");
  return files;
}

export async function buildScanMigration({ sourceDb, outputDb, partsDir, scannerBuild = DEFAULT_BUILD, maxPartBytes = DEFAULT_MAX_PART_BYTES, maxPartStatements = DEFAULT_MAX_PART_STATEMENTS }) {
  ensureEmptyDatabase(outputDb);
  runSqlite(outputDb, buildSubsetSql(sourceDb, scannerBuild));
  const compacted = await compactReportRows(outputDb);
  const files = await dumpIntoParts(outputDb, partsDir, maxPartBytes, maxPartStatements);
  const counts = spawnSync("sqlite3", [outputDb, "SELECT 'jobs',COUNT(*) FROM app_scan_jobs UNION ALL SELECT 'reports',COUNT(*) FROM app_scan_reports UNION ALL SELECT 'queued',COUNT(*) FROM app_scan_jobs WHERE status='queued';"], { encoding: "utf8" });
  if (counts.status !== 0) throw new Error(`Could not validate migration subset: ${counts.stderr || counts.stdout}`);
  return { sourceDb, outputDb, partsDir, scannerBuild, compacted, files, counts: counts.stdout.trim().split("\n") };
}

async function main() {
  const args = process.argv.slice(2);
  const sourceDb = parseFlag(args, "--source-db", ".tmp/registry-export.db");
  const outputDb = parseFlag(args, "--output-db", ".tmp/scan-subset.db");
  const partsDir = parseFlag(args, "--parts-dir", ".tmp/scan-import");
  const scannerBuild = parseFlag(args, "--scanner-build", DEFAULT_BUILD);
  const maxPartBytes = Number(parseFlag(args, "--max-part-bytes", String(DEFAULT_MAX_PART_BYTES)));
  const maxPartStatements = Number(parseFlag(args, "--max-part-statements", String(DEFAULT_MAX_PART_STATEMENTS)));
  const result = await buildScanMigration({ sourceDb, outputDb, partsDir, scannerBuild, maxPartBytes, maxPartStatements });
  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
