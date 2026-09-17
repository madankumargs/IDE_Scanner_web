import type { PrivateDatabase } from "@/lib/cloudflarePrivate";
import { dispatchGithubDeepScan } from "@/lib/cloudflareGithubDispatch";

type Row = Record<string, unknown>;
type SchedulerEnvironment = Record<string, unknown>;

export type ScheduledScanResult = {
  dispatched: boolean;
  job_id?: string;
  reason: "idle" | "recently_dispatched" | "dispatched" | "not_configured" | "github_unavailable";
};

/**
 * Cloudflare Cron backstop for GitHub's best-effort scheduled workflows.
 * Only queued work is dispatched; an idle system does not create runners.
 */
export async function dispatchQueuedCloudflareScan(
  env: SchedulerEnvironment,
  db: PrivateDatabase,
  now = new Date(),
): Promise<ScheduledScanResult> {
  const token = stringValue(env.GITHUB_ACTIONS_TOKEN);
  if (!token) return { dispatched: false, reason: "not_configured" };

  const job = await db
    .prepare("SELECT id,dispatch_count,updated_at FROM app_scan_jobs WHERE status='queued' ORDER BY created_at LIMIT 1")
    .first<Row>();
  if (!job?.id) return { dispatched: false, reason: "idle" };

  const updatedAt = Date.parse(String(job.updated_at || ""));
  if (Number(job.dispatch_count || 0) > 0 && Number.isFinite(updatedAt) && now.getTime() - updatedAt < 10 * 60_000) {
    return { dispatched: false, job_id: String(job.id), reason: "recently_dispatched" };
  }

  const owner = stringValue(env.GITHUB_REPO_OWNER) || "preethamak";
  const repository = stringValue(env.GITHUB_SCANNER_REPO) || "IDE_Scanner";
  const response = await dispatchGithubDeepScan({ token, owner, repository }, String(job.id));
  if (response.status === 401 || response.status === 403) {
    return { dispatched: false, job_id: String(job.id), reason: "github_unavailable" };
  }
  if (!response.ok) throw new Error(`Scheduled Deep Scan dispatch failed (${response.status}).`);

  const timestamp = now.toISOString();
  await db
    .prepare("UPDATE app_scan_jobs SET dispatch_count=dispatch_count+1,lifecycle_stage='dispatched',updated_at=?,last_event_at=? WHERE id=? AND status='queued'")
    .bind(timestamp, timestamp, String(job.id))
    .run();
  return { dispatched: true, job_id: String(job.id), reason: "dispatched" };
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}
