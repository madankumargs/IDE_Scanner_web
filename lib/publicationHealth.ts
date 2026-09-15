import { getDeepScanHealth } from "@/lib/deepScanHealth";
import { cloudflarePrivateAvailable } from "@/lib/cloudflareDeepScan";
import { privateDb } from "@/lib/cloudflarePrivate";
import { serviceDb } from "@/lib/supabase";

export type PublicationHealth = {
  healthy: boolean;
  reasons: string[];
  active_release: { id: string; expected_reports: number; activated_at: string } | null;
  current_report_count: number;
  newest_scan_at: string | null;
  runner_status: string;
  runner_last_seen_at: string | null;
  scan_failure_rate: number;
  notification_failure_rate: number;
};

export function evaluatePublicationHealth(input: Omit<PublicationHealth, "healthy" | "reasons">): PublicationHealth {
  const reasons: string[] = [];
  if (!input.active_release) reasons.push("No active public classification release.");
  else if (input.current_report_count < input.active_release.expected_reports) reasons.push("Active release is missing published reports.");
  if (!input.newest_scan_at || Date.now() - new Date(input.newest_scan_at).getTime() > 30 * 60 * 60 * 1000) reasons.push("Public scan corpus is older than 30 hours.");
  if (input.runner_status !== "ready") reasons.push(`Deep Scan runner is ${input.runner_status}.`);
  if (input.scan_failure_rate > 0.1) reasons.push("Scan failure rate exceeds 10 percent.");
  if (input.notification_failure_rate > 0.1) reasons.push("Notification failure rate exceeds 10 percent.");
  return { ...input, healthy: reasons.length === 0, reasons };
}

type ReleaseMemberScan = { id: string; scanned_at: string | null };

/**
 * A publication release is an immutable exact-artifact manifest. Its health
 * must be derived from those members rather than the scan metadata that may
 * evolve after activation.
 */
export function summarizeReleaseMemberScans(rows: ReleaseMemberScan[]): Pick<PublicationHealth, "current_report_count" | "newest_scan_at"> {
  const unique = new Map(rows.map((row) => [row.id, row]));
  const scannedAt = [...unique.values()].map((row) => row.scanned_at).filter((value): value is string => Boolean(value)).sort().at(-1) || null;
  return { current_report_count: unique.size, newest_scan_at: scannedAt };
}

export async function getPublicationHealth(): Promise<PublicationHealth> {
  if (cloudflarePrivateAvailable()) return getCloudflarePublicationHealth();
  const db = serviceDb();
  const releaseResult = await db.from("scan_publication_releases").select("id,policy_version,ruleset_version,score_schema_version,scanner_build,expected_reports,activated_at").eq("active", true).maybeSingle();
  if (releaseResult.error) throw releaseResult.error;
  const release = releaseResult.data;
  const [runner, deliveries, scans] = await Promise.all([
    getDeepScanHealth(),
    db.from("team_notification_deliveries").select("status").in("status", ["sent", "failed", "skipped"]).gte("created_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()).limit(1000),
    db.from("scans").select("analysis_status").in("scan_purpose", ["public_intelligence", "benchmark", "user_request"]).gte("scanned_at", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()).limit(1000),
  ]);
  if (deliveries.error) throw deliveries.error;
  if (scans.error) throw scans.error;
  let currentReportCount = 0; let newestScanAt: string | null = null;
  if (release) {
    const members = await db.from("scan_publication_release_scans").select("scan_id").eq("release_id", release.id);
    if (members.error) throw members.error;
    const scanIds = [...new Set((members.data || []).map((member) => String(member.scan_id)).filter(Boolean))];
    if (scanIds.length) {
      const memberScans = await db.from("scans").select("id,scanned_at").in("id", scanIds).in("scan_purpose", ["public_intelligence", "benchmark"]).eq("analysis_status", "complete").is("superseded_at", null);
      if (memberScans.error) throw memberScans.error;
      ({ current_report_count: currentReportCount, newest_scan_at: newestScanAt } = summarizeReleaseMemberScans((memberScans.data || []).map((scan) => ({ id: String(scan.id), scanned_at: scan.scanned_at ? String(scan.scanned_at) : null }))));
    }
  }
  const completed = deliveries.data || [];
  const failures = completed.filter((item) => item.status === "failed").length;
  const recentScans = scans.data || [];
  const scanFailures = recentScans.filter((item) => item.analysis_status === "failed").length;
  return evaluatePublicationHealth({ active_release: release ? { id: String(release.id), expected_reports: Number(release.expected_reports), activated_at: String(release.activated_at) } : null, current_report_count: currentReportCount, newest_scan_at: newestScanAt, runner_status: runner.status, runner_last_seen_at: runner.last_seen_at, scan_failure_rate: recentScans.length ? scanFailures / recentScans.length : 0, notification_failure_rate: completed.length ? failures / completed.length : 0 });
}

async function getCloudflarePublicationHealth(): Promise<PublicationHealth> {
  const db = privateDb();
  const since = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
  const [reports, jobs, deliveries, runner] = await Promise.all([
    db.prepare("SELECT COUNT(*) AS count, MAX(created_at) AS newest_scan_at FROM app_scan_reports").first<Record<string, unknown>>(),
    db.prepare("SELECT status, COUNT(*) AS count FROM app_scan_jobs WHERE created_at>=? GROUP BY status").bind(since).all<Record<string, unknown>>(),
    db.prepare("SELECT status, COUNT(*) AS count FROM app_notification_deliveries WHERE created_at>=? GROUP BY status").bind(since).all<Record<string, unknown>>(),
    getDeepScanHealth(),
  ]);
  const currentReportCount = Number(reports?.count || 0);
  const newestScanAt = reports?.newest_scan_at ? String(reports.newest_scan_at) : null;
  const jobRows = jobs.results || [];
  const deliveryRows = deliveries.results || [];
  const jobCount = jobRows.reduce((sum, row) => sum + Number(row.count || 0), 0);
  const failedJobs = jobRows.filter((row) => String(row.status) === "failed").reduce((sum, row) => sum + Number(row.count || 0), 0);
  const deliveryCount = deliveryRows.reduce((sum, row) => sum + Number(row.count || 0), 0);
  const failedDeliveries = deliveryRows.filter((row) => String(row.status) === "failed").reduce((sum, row) => sum + Number(row.count || 0), 0);
  const reasons: string[] = [];
  if (!currentReportCount) reasons.push("No completed Deep Scan reports in Cloudflare D1.");
  if (!newestScanAt || Date.now() - new Date(newestScanAt).getTime() > 30 * 60 * 60 * 1000) reasons.push("Public scan corpus is older than 30 hours.");
  if (runner.status !== "ready") reasons.push(`Deep Scan runner is ${runner.status}.`);
  if (jobCount && failedJobs / jobCount > 0.1) reasons.push("Scan failure rate exceeds 10 percent.");
  if (deliveryCount && failedDeliveries / deliveryCount > 0.1) reasons.push("Notification failure rate exceeds 10 percent.");
  return {
    healthy: reasons.length === 0,
    reasons,
    active_release: currentReportCount ? { id: "cloudflare-d1-corpus", expected_reports: currentReportCount, activated_at: newestScanAt || new Date().toISOString() } : null,
    current_report_count: currentReportCount,
    newest_scan_at: newestScanAt,
    runner_status: runner.status,
    runner_last_seen_at: runner.last_seen_at,
    scan_failure_rate: jobCount ? failedJobs / jobCount : 0,
    notification_failure_rate: deliveryCount ? failedDeliveries / deliveryCount : 0,
  };
}
