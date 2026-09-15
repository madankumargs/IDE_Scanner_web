import { createHash } from "node:crypto";
import { resolveMarketplaceExtension } from "@/lib/marketplace";
import { serviceDb } from "@/lib/supabase";
import { getDeepScanHealth } from "@/lib/deepScanHealth";
import { cloudflarePrivateAvailable, dispatchCloudflareDeepScan, queueCloudflareDeepScan } from "@/lib/cloudflareDeepScan";
import { runtimeEnv } from "@/lib/runtimeEnv";

export class DeepScanUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DeepScanUnavailableError";
  }
}

export async function queueDeepScan(extensionId: string, requestedVersion: string | undefined, request: Request, requestedBy: string, force = false): Promise<Record<string, unknown>> {
  if (cloudflarePrivateAvailable()) {
    return queueCloudflareDeepScan(extensionId, requestedVersion, request, { id: requestedBy, email: "", display_name: "", provider: "github", provider_subject: requestedBy, user_metadata: {}, app_metadata: { provider: "github" } }, force);
  }
  const health = await getDeepScanHealth();
  if (!health.accepting_requests) throw new DeepScanUnavailableError("Deep Scan is not configured to accept requests.");
  const db = serviceDb();

  const item = await resolveMarketplaceExtension(extensionId);
  const canonicalExtensionId = item.extension_id;
  const version = requestedVersion || item.version;
  if (!version) throw new Error("No published version is available for this extension.");

  const active = await db.from("scan_jobs").select("*").eq("extension_id", canonicalExtensionId).eq("version", version).eq("profile", "deep").in("status", ["queued", "running"]).maybeSingle();
  if (active.error) throw active.error;
  if (active.data) {
    await subscribeToJob(String(active.data.id), requestedBy);
    // A prior dispatch can be lost or GitHub schedules can be delayed. Do not
    // leave a deduplicated queued job stranded: a new request is a safe wake-up
    // signal because workers claim jobs atomically and extra workflows exit on
    // an empty queue.
    const dispatched = active.data.status === "queued" ? await dispatchDeepScan(String(active.data.id), 120) : false;
    return withReportUrl({ ...active.data, deduplicated: true, dispatch: dispatched ? "started" : "scheduled" });
  }

  // A version is not a sufficient cache key. Reusing an older scanner build
  // would silently return a result produced before a precision or coverage fix.
  const requiredBuild = await currentScannerBuild();
  if (requiredBuild && !force) {
    const complete = await db.from("scans").select("id").eq("extension_id", canonicalExtensionId).eq("version", version).eq("scanner_build", requiredBuild).eq("analysis_status", "complete").order("scanned_at", { ascending: false }).limit(1).maybeSingle();
    if (complete.error) throw complete.error;
    if (complete.data) return withReportUrl({ status: "complete", scan_id: complete.data.id, reused: true, extension_id: canonicalExtensionId, version });
  }

  const since = new Date(Date.now() - 86_400_000).toISOString();
  const recent = await db.from("scan_jobs").select("id", { count: "exact", head: true }).eq("requested_by", requestedBy).gte("created_at", since);
  if (recent.error) throw recent.error;
  if ((recent.count || 0) >= 10) throw new Error("Daily Deep Scan limit reached.");

  const extension = await db.from("extensions").upsert({ id: item.extension_id, name: item.extension_id.split(".").slice(1).join("."), display_name: item.display_name, publisher: item.publisher, description: item.short_description, registry: item.registry || "vs-marketplace", publisher_verified: item.publisher_verified, installs: item.install_count, rating: item.rating_average, icon_url: item.icon_url, updated_at: new Date().toISOString() }, { onConflict: "id" });
  if (extension.error) throw extension.error;

  const artifact = await db.from("extension_versions").upsert({ extension_id: item.extension_id, version, registry: item.registry || "vs-marketplace", is_latest: version === item.version, scan_state: "queued" }, { onConflict: "extension_id,version" });
  if (artifact.error) throw artifact.error;

  const requesterHash = hashRequester(request);
  // The workflow binds this job to its actual github.sha in the atomic claim.
  // Predicting main here creates a race when the branch advances before the
  // dispatched workflow starts.
  const job = await db.from("scan_jobs").insert({ extension_id: canonicalExtensionId, version, profile: "deep", requester_hash: requesterHash, requested_by: requestedBy, scan_purpose: "user_request", status: "queued", expected_scanner_build: null, claim_protocol: 2 }).select("*").single();
  if (job.error) {
    const concurrent = await db.from("scan_jobs").select("*").eq("extension_id", canonicalExtensionId).eq("version", version).eq("profile", "deep").in("status", ["queued", "running"]).maybeSingle();
    if (concurrent.data) {
      await subscribeToJob(String(concurrent.data.id), requestedBy);
      const dispatched = concurrent.data.status === "queued" ? await dispatchDeepScan(String(concurrent.data.id), 120) : false;
      return { ...concurrent.data, deduplicated: true, dispatch: dispatched ? "started" : "scheduled" };
    }
    await db.from("extension_versions").update({ scan_state: "failed" }).eq("extension_id", canonicalExtensionId).eq("version", version);
    throw job.error;
  }
  await subscribeToJob(String(job.data.id), requestedBy);
  await db.from("scan_job_events").insert({ job_id: job.data.id, stage: "queued", event_type: "created", detail: { extension_id: canonicalExtensionId, version, requested_by: requestedBy } });
  let dispatched = false;
  try {
    dispatched = await dispatchDeepScan(String(job.data.id));
  } catch (error) {
    const message = error instanceof Error ? error.message : "The Deep Scan worker could not be started.";
    await db.from("scan_jobs").update({ status: "failed", lifecycle_stage: "failed", error: message, callback_error: message, completed_at: new Date().toISOString(), updated_at: new Date().toISOString(), last_event_at: new Date().toISOString() }).eq("id", job.data.id);
    await db.from("scan_job_events").insert({ job_id: job.data.id, stage: "failed", event_type: "dispatch_failed", detail: { error: message } });
    await db.from("extension_versions").update({ scan_state: "failed" }).eq("extension_id", canonicalExtensionId).eq("version", version);
    throw new Error(message);
  }
  return withReportUrl({ ...job.data, profile: "deep", runner_poll_seconds: 0, dispatch: dispatched ? "started" : "scheduled" });
}

export function withReportUrl<T extends Record<string, unknown>>(result: T): T & { report_url?: string } {
  const extensionId = typeof result.extension_id === "string" ? result.extension_id : "";
  const version = typeof result.version === "string" ? result.version : "";
  const scanId = typeof result.scan_id === "string" ? result.scan_id : "";
  const complete = ["complete", "incomplete"].includes(String(result.status));
  if (!complete || !extensionId || !version) return result;
  const base = `/extensions/${encodeURIComponent(extensionId)}/versions/${encodeURIComponent(version)}`;
  return { ...result, report_url: scanId ? `${base}/scans/${encodeURIComponent(scanId)}` : base };
}

export async function dispatchDeepScan(jobId: string, minimumIntervalSeconds = 0): Promise<boolean> {
  if (cloudflarePrivateAvailable()) return dispatchCloudflareDeepScan(jobId, minimumIntervalSeconds);
  const token = runtimeEnv("GITHUB_ACTIONS_TOKEN");
  const owner = runtimeEnv("GITHUB_REPO_OWNER") || "preethamak";
  const repository = runtimeEnv("GITHUB_SCANNER_REPO") || "IDE_Scanner";
  if (!token) throw new Error("Deep Scan dispatch is not configured.");
  const db = serviceDb();
  const reservation = await db.rpc("reserve_deep_scan_dispatch", {
    p_job_id: jobId,
    p_minimum_interval_seconds: minimumIntervalSeconds,
    p_max_attempts: 4,
  });
  if (reservation.error) throw reservation.error;
  if (reservation.data !== true) return false;
  await db.from("scan_job_events").insert({ job_id: jobId, stage: "dispatching", event_type: "dispatch_requested", detail: { repository: `${owner}/${repository}` } });
  const response = await dispatchWorkflow(owner, repository, token, jobId);
  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      await db.from("scan_job_events").insert({ job_id: jobId, stage: "queued", event_type: "dispatch_deferred", detail: { error: `GitHub workflow dispatch unavailable (${response.status}).`, repository: `${owner}/${repository}` } });
      return false;
    }
    throw new Error(`Deep Scan dispatch failed (${response.status}).`);
  }
  const succeededAt = new Date().toISOString();
  await db.from("scan_jobs").update({ lifecycle_stage: "dispatched", dispatch_succeeded_at: succeededAt, updated_at: succeededAt, last_event_at: succeededAt }).eq("id", jobId).eq("status", "queued");
  await db.from("scan_job_events").insert({ job_id: jobId, stage: "dispatched", event_type: "dispatch_accepted", detail: { repository: `${owner}/${repository}` } });
  return true;
}

async function dispatchWorkflow(owner: string, repository: string, token: string, jobId: string): Promise<Response> {
  const url = `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/actions/workflows/deep-scan.yml/dispatches`;
  let response: Response | undefined;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    response = await fetch(url, {
      method: "POST",
      headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}`, "X-GitHub-Api-Version": "2022-11-28", "Content-Type": "application/json", "User-Agent": "guardrails-web" },
      body: JSON.stringify({ ref: "main", inputs: { job_id: jobId } }),
      cache: "no-store",
    });
    if (response.ok || response.status < 500 || attempt === 2) return response;
  }
  throw new Error("Deep Scan dispatch did not return a response.");
}

async function subscribeToJob(jobId: string, userId: string): Promise<void> {
  const result = await serviceDb().from("scan_job_subscribers").upsert({ job_id: jobId, user_id: userId }, { onConflict: "job_id,user_id" });
  if (result.error) throw result.error;
}

async function currentScannerBuild(): Promise<string | null> {
  const token = runtimeEnv("GITHUB_ACTIONS_TOKEN");
  const owner = runtimeEnv("GITHUB_REPO_OWNER") || "preethamak";
  const repository = runtimeEnv("GITHUB_SCANNER_REPO") || "IDE_Scanner";
  if (!token) return null;
  const response = await fetch(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/commits/main`, {
    headers: { Accept: "application/vnd.github+json", Authorization: `Bearer ${token}`, "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "guardrails-web" },
    cache: "no-store",
  });
  if (!response.ok) return null;
  const body = await response.json().catch(() => null) as { sha?: unknown } | null;
  const sha = typeof body?.sha === "string" ? body.sha.trim() : "";
  return /^[0-9a-f]{40}$/i.test(sha) ? sha : null;
}

function hashRequester(request: Request): string {
  const raw = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  return createHash("sha256").update(`${runtimeEnv("SCAN_RATE_LIMIT_SECRET") || "ide-scanner"}:${raw}`).digest("hex");
}
