import "server-only";

import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { parseCookies, privateDb, newId, nowIso, sessionHash, type AppAuthUser } from "@/lib/cloudflarePrivate";
import { runtimeEnv } from "@/lib/runtimeEnv";
import { resolveMarketplaceExtension } from "@/lib/marketplace";
import { getCloudflareRegistryCatalogExtension, getCloudflareRegistryProduct } from "@/lib/cloudflareRegistry";

type Row = Record<string, unknown>;
type Bundle = { metadata?: Row; extensions?: Row | Row[] };
const GUEST_TRIAL_LIMIT = 5;
const GUEST_TRIAL_WINDOW_DAYS = 30;
const GUEST_TRIAL_COOKIE = "gr_trial";
export type CloudflareCanonicalJobInput = {
  extension_id: string;
  version: string;
  scan_purpose: "benchmark" | "public_intelligence";
  scanner_build: string;
  target_platform: string;
};

export function cloudflarePrivateAvailable(): boolean {
  try { privateDb(); return true; } catch { return false; }
}

export type GuestTrialStatus = { available: boolean; remaining: number; limit: number; window_days: number };

export function guestTrialToken(request: Request): string {
  return parseCookies(request.headers.get("cookie") || "")[GUEST_TRIAL_COOKIE] || "";
}

export function guestTrialCookie(token: string, maxAge = GUEST_TRIAL_WINDOW_DAYS * 24 * 60 * 60): string {
  return `${GUEST_TRIAL_COOKIE}=${encodeURIComponent(token)}; Max-Age=${maxAge}; Path=/; HttpOnly; Secure; SameSite=Lax`;
}

export async function cloudflareGuestTrialStatus(request: Request): Promise<GuestTrialStatus> {
  const db = privateDb();
  const trialKey = requesterHash(request);
  const row = await db.prepare("SELECT scan_count,window_started_at FROM app_guest_scan_trials WHERE trial_key=? LIMIT 1").bind(trialKey).first<Row>();
  const expired = !row || !withinGuestTrialWindow(String(row.window_started_at || ""));
  const used = expired ? 0 : Number(row?.scan_count || 0);
  return { available: used < GUEST_TRIAL_LIMIT, remaining: Math.max(0, GUEST_TRIAL_LIMIT - used), limit: GUEST_TRIAL_LIMIT, window_days: GUEST_TRIAL_WINDOW_DAYS };
}

export async function getCloudflareGuestJob(jobId: string, token: string): Promise<Row | null> {
  if (!token) return null;
  return privateDb().prepare("SELECT j.* FROM app_scan_jobs j JOIN app_guest_scan_access a ON a.job_id=j.id WHERE j.id=? AND a.token_hash=? LIMIT 1").bind(jobId, sessionHash(token)).first<Row>();
}

export async function getCloudflareGuestJobForRelease(extensionId: string, version: string, token: string): Promise<Row | null> {
  if (!token) return null;
  return privateDb().prepare("SELECT j.* FROM app_scan_jobs j JOIN app_guest_scan_access a ON a.job_id=j.id WHERE j.extension_id=? AND j.version=? AND a.token_hash=? ORDER BY j.created_at DESC LIMIT 1").bind(extensionId, version, sessionHash(token)).first<Row>();
}

export async function enqueueCloudflareCanonicalJobs(jobs: readonly CloudflareCanonicalJobInput[]): Promise<Row[]> {
  const db = privateDb();
  const queued: Row[] = [];
  for (const requested of jobs) {
    const product = await getCloudflareRegistryProduct<{ extension?: Row }>(requested.extension_id);
    let canonicalExtensionId = String(product?.extension?.id || product?.extension?.extension_id || requested.extension_id);
    if (!product?.extension) {
      try { canonicalExtensionId = (await resolveMarketplaceExtension(requested.extension_id)).extension_id; } catch { /* validation below returns a useful error */ }
    }
    if (!canonicalExtensionId) throw new Error(`Extension ${requested.extension_id} is not available in the public registry.`);
    const active = await db.prepare("SELECT * FROM app_scan_jobs WHERE extension_id=? AND version=? AND profile='deep' AND status IN ('queued','running') ORDER BY created_at DESC LIMIT 1").bind(canonicalExtensionId, requested.version).first<Row>();
    if (active) {
      const activeBuild = String(active.expected_scanner_build || "");
      const activeTargetPlatform = String(active.target_platform || "");
      if (activeBuild === requested.scanner_build && activeTargetPlatform === requested.target_platform) {
        queued.push({ ...active, deduplicated: true });
        continue;
      }
      if (String(active.status) === "running") throw new Error(`A different scanner build or target platform is already analyzing ${canonicalExtensionId}@${requested.version}.`);
      const now = nowIso();
      await db.prepare("UPDATE app_scan_jobs SET expected_scanner_build=?,scan_purpose=?,target_platform=?,requester_hash=?,updated_at=?,last_event_at=? WHERE id=? AND status='queued'").bind(requested.scanner_build, requested.scan_purpose, requested.target_platform, `canonical-${requested.scan_purpose}`, now, now, String(active.id)).run();
      await addCloudflareScanEvent(String(active.id), "queued", "rebound", { scanner_build: requested.scanner_build, scan_purpose: requested.scan_purpose, target_platform: requested.target_platform });
      queued.push({ ...active, expected_scanner_build: requested.scanner_build, scan_purpose: requested.scan_purpose, target_platform: requested.target_platform, deduplicated: true });
      continue;
    }
    const id = newId();
    const now = nowIso();
    await db.prepare(`INSERT INTO app_scan_jobs(id,extension_id,version,profile,status,lifecycle_stage,requester_hash,scan_purpose,expected_scanner_build,target_platform,created_at,updated_at,last_event_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id, canonicalExtensionId, requested.version, "deep", "queued", "queued", `canonical-${requested.scan_purpose}`, requested.scan_purpose, requested.scanner_build, requested.target_platform, now, now, now).run();
    await addCloudflareScanEvent(id, "queued", "canonical_created", { extension_id: canonicalExtensionId, version: requested.version, scan_purpose: requested.scan_purpose, scanner_build: requested.scanner_build });
    queued.push({ id, extension_id: canonicalExtensionId, version: requested.version, scan_purpose: requested.scan_purpose, status: "queued", deduplicated: false });
  }
  return queued;
}

export async function queueCloudflareDeepScan(extensionId: string, requestedVersion: string | undefined, request: Request, user: AppAuthUser, force = false, scanPurpose: "user_request" | "team_badge" = "user_request"): Promise<Row> {
  const db = privateDb();
  const catalog = await getCloudflareRegistryCatalogExtension<{ id?: string; latest_version?: string }>(extensionId);
  const marketplace = catalog ? null : await resolveMarketplaceExtension(extensionId);
  const canonicalExtensionId = String(catalog?.id || marketplace?.extension_id || extensionId);
  const version = requestedVersion || String(catalog?.latest_version || marketplace?.version || "");
  if (!version) throw new Error("No published version is available for this extension.");
  const active = await db.prepare("SELECT * FROM app_scan_jobs WHERE extension_id=? AND version=? AND profile='deep' AND status IN ('queued','running') ORDER BY created_at DESC LIMIT 1").bind(canonicalExtensionId, version).first<Row>();
  if (active) {
    await subscribeCloudflareJob(String(active.id), user.id);
    const dispatched = String(active.status) === "queued" ? await dispatchCloudflareDeepScan(String(active.id), 120) : false;
    return withCloudflareReportUrl({ ...active, deduplicated: true, dispatch: dispatched ? "started" : "scheduled" });
  }
  if (!force) {
    const complete = await db.prepare("SELECT scan_id FROM app_scan_reports WHERE extension_id=? AND version=? ORDER BY created_at DESC LIMIT 1").bind(canonicalExtensionId, version).first<Row>();
    if (complete?.scan_id) return withCloudflareReportUrl({ status: "complete", scan_id: String(complete.scan_id), reused: true, extension_id: canonicalExtensionId, version });
  }
  const since = new Date(Date.now() - 86_400_000).toISOString();
  const usage = await db.prepare("SELECT COUNT(*) AS count FROM app_scan_jobs WHERE requested_by=? AND created_at>=?").bind(user.id, since).first<Row>();
  if (Number(usage?.count || 0) >= 10) throw new Error("Daily Deep Scan limit reached.");
  const id = randomUUID();
  const createdAt = nowIso();
  const requester = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const requesterHash = createHash("sha256").update(`${runtimeEnv("SCAN_RATE_LIMIT_SECRET") || "ide-scanner"}:${requester}`).digest("hex");
  await db.prepare(`INSERT INTO app_scan_jobs(id,extension_id,version,profile,status,lifecycle_stage,requested_by,requester_hash,scan_purpose,created_at,updated_at,last_event_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).bind(id, canonicalExtensionId, version, "deep", "queued", "queued", user.id, requesterHash, scanPurpose, createdAt, createdAt, createdAt).run();
  await subscribeCloudflareJob(id, user.id);
  await addCloudflareScanEvent(id, "queued", "created", { extension_id: canonicalExtensionId, version, requested_by: user.id });
  let dispatched = false;
  try {
    dispatched = await dispatchCloudflareDeepScan(id);
  } catch (error) {
    const message = error instanceof Error ? error.message : "The Deep Scan worker could not be started.";
    await db.prepare("UPDATE app_scan_jobs SET status='failed',lifecycle_stage='failed',error=?,callback_error=?,completed_at=?,updated_at=?,last_event_at=? WHERE id=?").bind(message, message, nowIso(), nowIso(), nowIso(), id).run();
    await addCloudflareScanEvent(id, "failed", "dispatch_failed", { error: message });
    throw new Error(message);
  }
  return withCloudflareReportUrl({ id, extension_id: canonicalExtensionId, version, profile: "deep", status: "queued", lifecycle_stage: dispatched ? "dispatched" : "queued", dispatch: dispatched ? "started" : "scheduled" });
}

export class GuestTrialLimitError extends Error {
  constructor() {
    super("Your 5-scan free trial is used up. Sign in with GitHub to keep scanning and save your workspace history.");
    this.name = "GuestTrialLimitError";
  }
}

export async function queueCloudflareGuestDeepScan(extensionId: string, requestedVersion: string | undefined, request: Request, trialToken: string, force = false): Promise<Row> {
  if (!trialToken) throw new Error("A trial session is required.");
  const db = privateDb();
  const trialKey = requesterHash(request);
  const trial = await cloudflareGuestTrialStatus(request);
  const catalog = await getCloudflareRegistryCatalogExtension<{ id?: string; latest_version?: string }>(extensionId);
  const marketplace = catalog ? null : await resolveMarketplaceExtension(extensionId);
  const canonicalExtensionId = String(catalog?.id || marketplace?.extension_id || extensionId);
  const version = requestedVersion || String(catalog?.latest_version || marketplace?.version || "");
  if (!version) throw new Error("No published version is available for this extension.");
  const complete = !force ? await db.prepare("SELECT scan_id FROM app_scan_reports WHERE extension_id=? AND version=? ORDER BY created_at DESC LIMIT 1").bind(canonicalExtensionId, version).first<Row>() : null;
  if (complete?.scan_id) return withCloudflareReportUrl({ status: "complete", scan_id: String(complete.scan_id), reused: true, extension_id: canonicalExtensionId, version, trial_remaining: trial.remaining });
  if (!trial.available) throw new GuestTrialLimitError();
  const tokenHash = sessionHash(trialToken);
  const active = await db.prepare("SELECT j.* FROM app_scan_jobs j WHERE j.extension_id=? AND j.version=? AND j.profile='deep' AND j.status IN ('queued','running') AND EXISTS (SELECT 1 FROM app_guest_scan_access a WHERE a.job_id=j.id AND a.token_hash=?) ORDER BY j.created_at DESC LIMIT 1").bind(canonicalExtensionId, version, tokenHash).first<Row>();
  if (active) return withCloudflareReportUrl({ ...active, deduplicated: true, trial_remaining: trial.remaining });
  const id = newId();
  const createdAt = nowIso();
  await consumeGuestTrial(trialKey, createdAt);
  await db.batch([
    db.prepare("INSERT INTO app_scan_jobs(id,extension_id,version,profile,status,lifecycle_stage,requester_hash,scan_purpose,created_at,updated_at,last_event_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)").bind(id, canonicalExtensionId, version, "deep", "queued", "queued", trialKey, "guest_trial", createdAt, createdAt, createdAt),
    db.prepare("INSERT INTO app_guest_scan_access(job_id,token_hash,trial_key,created_at) VALUES(?,?,?,?)").bind(id, tokenHash, trialKey, createdAt),
  ]);
  await addCloudflareScanEvent(id, "queued", "guest_trial_created", { extension_id: canonicalExtensionId, version });
  let dispatched = false;
  try {
    dispatched = await dispatchCloudflareDeepScan(id);
  } catch (error) {
    const message = error instanceof Error ? error.message : "The Deep Scan worker could not be started.";
    await db.prepare("UPDATE app_scan_jobs SET status='failed',lifecycle_stage='failed',error=?,callback_error=?,completed_at=?,updated_at=?,last_event_at=? WHERE id=?").bind(message, message, nowIso(), nowIso(), nowIso(), id).run();
    await addCloudflareScanEvent(id, "failed", "dispatch_failed", { error: message });
    throw new Error(message);
  }
  return { id, extension_id: canonicalExtensionId, version, profile: "deep", status: "queued", lifecycle_stage: dispatched ? "dispatched" : "queued", dispatch: dispatched ? "started" : "scheduled", trial_remaining: Math.max(0, trial.remaining - 1) };
}

export async function dispatchCloudflareDeepScan(jobId: string, minimumIntervalSeconds = 0): Promise<boolean> {
  const token = runtimeEnv("GITHUB_ACTIONS_TOKEN");
  if (!token) throw new Error("Deep Scan dispatch is not configured.");
  const db = privateDb();
  const job = await db.prepare("SELECT dispatch_count,updated_at,status FROM app_scan_jobs WHERE id=?").bind(jobId).first<Row>();
  if (!job) throw new Error("Scan job was not found.");
  const last = job.updated_at ? new Date(String(job.updated_at)).getTime() : 0;
  if (minimumIntervalSeconds > 0 && Number(job.dispatch_count || 0) > 0 && Date.now() - last < minimumIntervalSeconds * 1000) return false;
  const owner = runtimeEnv("GITHUB_REPO_OWNER") || "preethamak";
  const repository = runtimeEnv("GITHUB_SCANNER_REPO") || "IDE_Scanner";
  const response = await fetch(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/actions/workflows/deep-scan.yml/dispatches`, { method: "POST", headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}`, "X-GitHub-Api-Version": "2022-11-28", "Content-Type": "application/json", "User-Agent": "guardrails-web" }, body: JSON.stringify({ ref: "main", inputs: { job_id: jobId } }), cache: "no-store", signal: AbortSignal.timeout(8_000) });
  if (!response.ok) {
    // The workflow also runs on a five-minute schedule. A token that can read
    // the repository but cannot dispatch workflows returns 401/403 here; the
    // queued job must stay retryable so the scheduled runner can claim it.
    if (response.status === 401 || response.status === 403) {
      await addCloudflareScanEvent(jobId, "queued", "dispatch_deferred", { error: `GitHub workflow dispatch unavailable (${response.status}).`, repository: `${owner}/${repository}` });
      return false;
    }
    throw new Error(`Deep Scan dispatch failed (${response.status}).`);
  }
  const now = nowIso();
  await db.prepare("UPDATE app_scan_jobs SET dispatch_count=dispatch_count+1,lifecycle_stage='dispatched',updated_at=?,last_event_at=? WHERE id=?").bind(now, now, jobId).run();
  await addCloudflareScanEvent(jobId, "dispatched", "dispatch_accepted", { repository: `${owner}/${repository}` });
  return true;
}

export async function cloudflareScanProgress(job: Row): Promise<Row> {
  const db = privateDb();
  const events = await db.prepare("SELECT stage,event_type,detail_json,created_at FROM app_scan_job_events WHERE job_id=? ORDER BY created_at DESC LIMIT 12").bind(String(job.id)).all<Row>();
  const report = await db.prepare("SELECT scan_id FROM app_scan_reports WHERE job_id=? LIMIT 1").bind(String(job.id)).first<Row>();
  const runId = Number(job.github_run_id || 0);
  const owner = runtimeEnv("GITHUB_REPO_OWNER") || "preethamak";
  const repository = runtimeEnv("GITHUB_SCANNER_REPO") || "IDE_Scanner";
  const eventsPayload = events.results.map((event) => ({ ...event, detail: parseJson(event.detail_json) }));
  return withCloudflareReportUrl({ ...job, scan_id: report?.scan_id ? String(report.scan_id) : null, queue_position: 0, github_run_url: Number.isSafeInteger(runId) && runId > 0 ? `https://github.com/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/actions/runs/${runId}` : null, events: eventsPayload });
}

export async function claimCloudflareJob(input: { runnerId: string; jobId: string | null; githubRunId: number | null; githubSha: string }): Promise<Row | null> {
  const db = privateDb();
  const where = input.jobId
    ? "id=? AND status='queued' AND (expected_scanner_build IS NULL OR lower(expected_scanner_build)=lower(?))"
    : "status='queued' AND (expected_scanner_build IS NULL OR lower(expected_scanner_build)=lower(?))";
  const values = input.jobId ? [input.jobId, input.githubSha] : [input.githubSha];
  const job = await db.prepare(`SELECT * FROM app_scan_jobs WHERE ${where} ORDER BY created_at LIMIT 1`).bind(...values).first<Row>();
  if (!job) return null;
  const now = nowIso();
  await db.prepare("UPDATE app_scan_jobs SET status='running',lifecycle_stage='running',expected_scanner_build=COALESCE(expected_scanner_build,?),runner_id=?,github_run_id=?,attempt_count=attempt_count+1,started_at=COALESCE(started_at,?),updated_at=?,last_event_at=? WHERE id=? AND status='queued'").bind(input.githubSha, input.runnerId, input.githubRunId, now, now, now, String(job.id)).run();
  const updated = await db.prepare("SELECT * FROM app_scan_jobs WHERE id=?").bind(String(job.id)).first<Row>();
  await addCloudflareScanEvent(String(job.id), "running", "claimed", { runner_id: input.runnerId, scanner_build: input.githubSha });
  return updated;
}

export async function saveCloudflareScanResult(jobId: string, bundle: Bundle): Promise<string> {
  const db = privateDb();
  const job = await db.prepare("SELECT * FROM app_scan_jobs WHERE id=? LIMIT 1").bind(jobId).first<Row>();
  if (!job) throw new Error("Scan job was not found.");
  const detail = singleExtension(bundle.extensions);
  if (!detail) throw new Error("Scanner bundle must contain exactly one extension detail.");
  const identity = jsonObject(detail.artifact_identity);
  const extensionId = String(detail.extension_id || identity.extension_id || job.extension_id || "");
  const version = String(detail.version || identity.version || job.version || "");
  const artifactSha = String(identity.sha256 || detail.artifact_sha256 || "");
  if (!extensionId || !version || !artifactSha) throw new Error("Bundle is missing immutable artifact identity.");
  if (String(job.extension_id).toLowerCase() !== extensionId.toLowerCase() || String(job.version) !== version) throw new Error("Scanner result does not match the claimed artifact.");
  const scanId = randomUUID();
  const now = nowIso();
  await db.batch([
    db.prepare("INSERT INTO app_scan_reports(scan_id,job_id,extension_id,version,artifact_sha256,report_json,created_at) VALUES(?,?,?,?,?,?,?)").bind(scanId, jobId, extensionId, version, artifactSha, JSON.stringify(bundle), now),
    db.prepare("UPDATE app_scan_jobs SET status='complete',lifecycle_stage='completed',result_received_at=?,completed_at=?,updated_at=?,last_event_at=? WHERE id=?").bind(now, now, now, now, jobId),
  ]);
  await addCloudflareScanEvent(jobId, "completed", "result_published", { scan_id: scanId });
  return scanId;
}

export async function getCloudflareScanProduct(extensionId: string, version: string, scanId: string): Promise<Row | null> {
  if (!cloudflarePrivateAvailable()) return null;
  const row = await privateDb().prepare("SELECT report_json,artifact_sha256,created_at FROM app_scan_reports WHERE scan_id=? AND extension_id=? AND version=? LIMIT 1").bind(scanId, extensionId, version).first<Row>();
  if (!row?.report_json) return null;
  let bundle: Bundle;
  try { bundle = JSON.parse(String(row.report_json)) as Bundle; } catch { return null; }
  const detail = singleExtension(bundle.extensions);
  if (!detail) return null;
  const metadata = jsonObject(bundle.metadata);
  const coverage = jsonObject(detail.analysis_coverage);
  const identity = jsonObject(detail.artifact_identity);
  const inventory = jsonObject(detail.artifact_inventory);
  // Source previews are retained in D1 for on-demand retrieval, but they are
  // not needed to render the report shell. Keeping them out of the server
  // component payload prevents large VSIX reports from exceeding Worker CPU
  // limits during React Flight serialization.
  const renderInventory = Object.fromEntries(Object.entries(inventory).filter(([key]) => key !== "source_previews"));
  const report = {
    id: scanId,
    job_id: null,
    extension_id: extensionId,
    version,
    artifact_sha256: String(row.artifact_sha256 || identity.sha256 || ""),
    profile: String(metadata.profile || "deep"),
    schema_version: String(metadata.schema_version || "unknown"),
    scanner_version: String(metadata.scanner_version || "unknown"),
    scanner_build: String(metadata.scanner_build || "unknown"),
    ruleset_version: String(metadata.ruleset_version || "unknown"),
    analysis_status: String(detail.analysis_status || "complete"),
    decision: String(detail.decision || "incomplete"),
    decision_reason: String(detail.decision_reason || detail.verdict_reason || "Review scan evidence."),
    public_outcome: String(detail.public_outcome || "investigate"),
    decision_basis: String(detail.decision_basis || "deep_scan"),
    evidence_confidence: String(detail.evidence_confidence || "none"),
    capability_assessment: jsonObject(detail.capability_assessment),
    capabilities: jsonObject(detail.capabilities),
    security_dimensions: jsonObject(detail.security_dimensions),
    manifest: jsonObject(detail.manifest),
    artifact_inventory: renderInventory,
    baseline_diff: jsonObject(detail.baseline_diff),
    verdict: String(detail.verdict || "review"),
    severity: String(detail.severity || "INFO"),
    risk_score: Number(detail.risk_score || 0),
    malware_score: Number(detail.malware_score || 0),
    coverage_percent: Number(coverage.coverage_percent || 0),
    provider_coverage: jsonObject(coverage.providers),
    created_at: String(row.created_at || metadata.created_at || nowIso()),
    scanned_at: String(metadata.created_at || row.created_at || nowIso()),
  };
  const findings = array(detail.findings).map((item, index) => { const value = jsonObject(item); return { id: `${String(value.finding_id || value.rule_id || "finding")}-${index}`, rule_id: String(value.rule_id || "unknown"), category: String(value.category || "unknown"), severity: String(value.effective_severity || value.severity || "INFO"), confidence: Number(value.confidence || 0), evidence_class: String(value.evidence_class || "weak"), actionability: String(value.actionability || "contextual"), summary: String(value.evidence_summary || "Scanner evidence"), recommendation: String(value.recommendation || ""), file_refs: Array.isArray(value.file_refs) ? value.file_refs : [], evidence: jsonObject(value.evidence) }; });
  const files = array(inventory.files).map((item) => { const value = jsonObject(item); return { path: String(value.path || ""), sha256: String(value.sha256 || ""), size_bytes: Number(value.size_bytes || 0), kind: String(value.kind || "file") }; }).filter((item) => item.path);
  const dependencies = array(detail.dependency_inventory).map((item) => { const value = jsonObject(item); return { name: String(value.name || ""), version: String(value.version || "unknown"), ecosystem: String(value.ecosystem || "npm"), relationship: String(value.relationship || "transitive"), advisories: Array.isArray(value.advisories) ? value.advisories : [] }; }).filter((item) => item.name);
  return { version: { extension_id: extensionId, version, latest_scan_id: scanId, scan_state: report.analysis_status }, scan: report, findings, files, dependencies };
}

export async function getCloudflareLatestScanProduct(extensionId: string, version: string): Promise<Row | null> {
  if (!cloudflarePrivateAvailable()) return null;
  const row = await privateDb()
    .prepare("SELECT scan_id FROM app_scan_reports WHERE extension_id=? AND version=? ORDER BY created_at DESC LIMIT 1")
    .bind(extensionId, version)
    .first<Row>();
  return row?.scan_id ? getCloudflareScanProduct(extensionId, version, String(row.scan_id)) : null;
}

export async function getCloudflareScanSummary(extensionId: string, version: string): Promise<Row | null> {
  if (!cloudflarePrivateAvailable()) return null;
  const row = await privateDb().prepare(`
    SELECT
      report.scan_id AS id,
      report.extension_id,
      report.version,
      report.artifact_sha256,
      report.created_at,
      json_extract(report.report_json, '$.metadata.created_at') AS scanned_at,
      json_extract(extension.value, '$.analysis_status') AS analysis_status,
      json_extract(extension.value, '$.decision') AS decision,
      json_extract(extension.value, '$.decision_reason') AS decision_reason,
      json_extract(extension.value, '$.public_outcome') AS public_outcome,
      json_extract(extension.value, '$.decision_basis') AS decision_basis,
      json_extract(extension.value, '$.evidence_confidence') AS evidence_confidence,
      json_extract(extension.value, '$.coverage_percent.coverage_percent') AS coverage_percent,
      json_extract(extension.value, '$.risk_score') AS risk_score,
      json_extract(extension.value, '$.malware_score') AS malware_score,
      json_extract(extension.value, '$.scanner_build') AS scanner_build,
      json_extract(extension.value, '$.ruleset_version') AS ruleset_version,
      json_extract(extension.value, '$.capability_assessment') AS capability_assessment
    FROM app_scan_reports report
    JOIN json_each(report.report_json, '$.extensions') extension
      ON extension.key = 'extensions/' || report.extension_id || '@' || report.version || '.json'
    WHERE lower(report.extension_id)=lower(?)
      AND report.version=?
    ORDER BY report.created_at DESC
    LIMIT 1
  `).bind(extensionId, version).first<Row>();
  if (!row) return null;
  return { ...row, capability_assessment: parseJson(row.capability_assessment) };
}

export async function getCloudflareSourcePreview(extensionId: string, version: string, scanId: string | null, path: string): Promise<Row | null> {
  if (!cloudflarePrivateAvailable()) return null;
  const row = await privateDb().prepare(`
    SELECT
      json_extract(preview.value, '$.content') AS content,
      json_extract(preview.value, '$.content_sha256') AS content_sha256,
      json_extract(preview.value, '$.truncated') AS truncated
    FROM app_scan_reports report
    JOIN json_each(report.report_json, '$.extensions') extension
    JOIN json_each(json_extract(extension.value, '$.artifact_inventory.source_previews')) preview
      ON true
    WHERE report.extension_id=?
      AND report.version=?
      AND (?='' OR report.scan_id=?)
      AND json_extract(preview.value, '$.path')=?
    ORDER BY report.created_at DESC
    LIMIT 1
  `).bind(extensionId, version, scanId || "", scanId || "", path).first<Row>();
  if (!row || typeof row.content !== "string") return null;
  return row;
}

export async function failCloudflareScan(jobId: string, error: string): Promise<void> {
  const now = nowIso();
  await privateDb().prepare("UPDATE app_scan_jobs SET status='failed',lifecycle_stage='failed',error=?,callback_error=?,completed_at=?,updated_at=?,last_event_at=? WHERE id=?").bind(error.slice(0, 2000), error.slice(0, 2000), now, now, now, jobId).run();
  await addCloudflareScanEvent(jobId, "failed", "worker_failed", { error: error.slice(0, 2000) });
}

export async function verifyCloudflareCallback(body: Uint8Array, signature: string): Promise<boolean> {
  const secret = runtimeEnv("SCAN_CALLBACK_SECRET");
  if (!secret || !signature) return false;
  const expected = createHmac("sha256", secret).update(body).digest("hex");
  return signature.length === expected.length && timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
}

export function decodeCloudflareCallback(body: Uint8Array, encoding: string | null): Record<string, unknown> {
  const decoded = encoding === "gzip" ? gunzipSync(body).toString("utf8") : Buffer.from(body).toString("utf8");
  const parsed = JSON.parse(decoded) as unknown;
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Scan callback payload must be an object.");
  return parsed as Record<string, unknown>;
}

export function withCloudflareReportUrl<T extends Row>(result: T): T & { report_url?: string } {
  const extensionId = String(result.extension_id || "");
  const version = String(result.version || "");
  const scanId = String(result.scan_id || "");
  if (!extensionId || !version || !["complete", "incomplete"].includes(String(result.status))) return result;
  const base = `/extensions/${encodeURIComponent(extensionId)}/versions/${encodeURIComponent(version)}`;
  return { ...result, report_url: scanId ? `${base}/scans/${encodeURIComponent(scanId)}` : base };
}

async function subscribeCloudflareJob(jobId: string, userId: string): Promise<void> {
  await privateDb().prepare("INSERT OR IGNORE INTO app_scan_job_subscribers(job_id,user_id,created_at) VALUES(?,?,?)").bind(jobId, userId, nowIso()).run();
}

export async function addCloudflareScanEvent(jobId: string, stage: string, eventType: string, detail: Row): Promise<void> {
  await privateDb().prepare("INSERT INTO app_scan_job_events(job_id,stage,event_type,detail_json,created_at) VALUES(?,?,?,?,?)").bind(jobId, stage, eventType, JSON.stringify(detail), nowIso()).run();
}

function singleExtension(value: Bundle["extensions"]): Row | null {
  const entries = Array.isArray(value) ? value : value && typeof value === "object" ? Object.values(value) : [];
  const valid = entries.filter((item): item is Row => Boolean(item && typeof item === "object" && !Array.isArray(item)));
  return valid.length === 1 ? valid[0] : null;
}

function jsonObject(value: unknown): Row { return value && typeof value === "object" && !Array.isArray(value) ? value as Row : {}; }
function array(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }
function parseJson(value: unknown): unknown { try { return JSON.parse(String(value || "{}")); } catch { return {}; } }

function requesterHash(request: Request): string {
  const raw = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  return createHash("sha256").update(`${runtimeEnv("SCAN_RATE_LIMIT_SECRET") || "ide-scanner"}:${raw}`).digest("hex");
}

function withinGuestTrialWindow(start: string): boolean {
  const timestamp = Date.parse(start);
  return Number.isFinite(timestamp) && Date.now() - timestamp < GUEST_TRIAL_WINDOW_DAYS * 24 * 60 * 60 * 1000;
}

async function consumeGuestTrial(trialKey: string, now: string): Promise<void> {
  const db = privateDb();
  const existing = await db.prepare("SELECT scan_count,window_started_at FROM app_guest_scan_trials WHERE trial_key=? LIMIT 1").bind(trialKey).first<Row>();
  if (!existing || !withinGuestTrialWindow(String(existing.window_started_at || ""))) {
    await db.prepare("INSERT INTO app_guest_scan_trials(trial_key,scan_count,window_started_at,last_scan_at,created_at) VALUES(?,?,?,?,?) ON CONFLICT(trial_key) DO UPDATE SET scan_count=1,window_started_at=excluded.window_started_at,last_scan_at=excluded.last_scan_at").bind(trialKey, 1, now, now, now).run();
    return;
  }
  const update = await db.prepare("UPDATE app_guest_scan_trials SET scan_count=scan_count+1,last_scan_at=? WHERE trial_key=? AND scan_count<?").bind(now, trialKey, GUEST_TRIAL_LIMIT).run();
  const changes = Number(update.meta?.changes || 0);
  if (changes === 0) throw new GuestTrialLimitError();
}
