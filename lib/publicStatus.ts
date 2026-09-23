import { getDeepScanHealth } from "@/lib/deepScanHealth";
import { getPublicRegistrySnapshot } from "@/lib/publicRegistrySnapshot";
import { getCloudflareRegistryPublication } from "@/lib/cloudflareRegistry";
import { serviceDb } from "@/lib/supabase";
import { cloudflarePrivateAvailable } from "@/lib/cloudflareDeepScan";
import { privateDb, type PrivateDatabase } from "@/lib/cloudflarePrivate";
import { unstable_cache } from "next/cache";

export type ServiceState = "operational" | "degraded" | "outage" | "unknown";
export type PublicService = {
  id: string;
  name: string;
  description: string;
  state: ServiceState;
  detail: string;
  checked_at: string;
};
export type PublicIncident = {
  id: string;
  title: string;
  status: "investigating" | "identified" | "monitoring" | "resolved";
  impact: "minor" | "major" | "critical";
  started_at: string;
  resolved_at: string | null;
  summary: string;
};
export type PublicStatus = {
  checked_at: string;
  overall: ServiceState;
  services: PublicService[];
  incidents: PublicIncident[];
};

type HealthInput = {
  runner: Awaited<ReturnType<typeof getDeepScanHealth>>;
  newestRegistryRefresh: string | null;
  scanFailureRate: number | null;
  notificationFailureRate: number | null;
  databaseReachable: boolean;
  notificationConfigured?: boolean;
  publicMirrorAvailable?: boolean;
  incidents?: PublicIncident[];
  now?: Date;
};

export function evaluatePublicStatus(input: HealthInput): PublicStatus {
  const now = input.now ?? new Date();
  const checkedAt = now.toISOString();
  const refreshAge = input.newestRegistryRefresh
    ? now.getTime() - new Date(input.newestRegistryRefresh).getTime()
    : null;
  const services: PublicService[] = [
    service(
      "registry",
      "Extension registry",
      "Marketplace discovery and public release freshness.",
      refreshAge === null
        ? "unknown"
        : refreshAge <= 24 * 60 * 60_000
          ? "operational"
          : refreshAge <= 72 * 60 * 60_000
            ? "degraded"
            : "outage",
      input.newestRegistryRefresh
        ? `Last successful refresh ${formatAge(refreshAge!)} ago.`
        : "No successful refresh timestamp is available.",
      checkedAt,
    ),
    service(
      "deep-scan",
      "Deep Scan",
      "Queue acceptance and scanner-runner heartbeat.",
      input.runner.status === "ready"
        ? "operational"
        : input.runner.accepting_requests
          ? "degraded"
          : input.publicMirrorAvailable
            ? "degraded"
          : "outage",
      input.runner.status === "ready"
        ? input.runner.last_seen_at && Date.now() - new Date(input.runner.last_seen_at).getTime() < 12 * 60_000
          ? "Runner heartbeat is current and requests are accepted."
          : "Runner is idle; requests are accepted and queued work is dispatched automatically."
        : input.runner.accepting_requests
          ? "Requests are accepted, but the latest runner heartbeat is delayed."
          : input.publicMirrorAvailable
            ? "Public registry reads are available from the mirror; scan requests wait for the primary data store."
          : "Deep Scan is not currently configured to accept requests.",
      checkedAt,
    ),
    service(
      "analysis",
      "Analysis publication",
      "Canonical report completion during the last 24 hours.",
      rateState(input.scanFailureRate),
      rateDetail(input.scanFailureRate, "scan"),
      checkedAt,
    ),
    service(
      "notifications",
      "Notification delivery",
      "Team delivery outcomes during the last 24 hours.",
      input.notificationFailureRate === null && input.notificationConfigured === false
        ? "operational"
        : rateState(input.notificationFailureRate),
      input.notificationFailureRate === null && input.notificationConfigured === false
        ? "No notification channels are configured; no deliveries are pending."
        : rateDetail(input.notificationFailureRate, "delivery"),
      checkedAt,
    ),
    service(
      "api",
      "Public API and data store",
      "Availability of the database used by public product routes.",
      input.databaseReachable
        ? "operational"
        : input.publicMirrorAvailable
          ? "degraded"
          : "outage",
      input.databaseReachable
        ? "The public status check reached the data store."
        : input.publicMirrorAvailable
          ? "The primary data store is restricted, but the read-only public registry mirror is serving data."
        : "The data store did not answer this status check.",
      checkedAt,
    ),
  ];
  const activeIncidents = (input.incidents ?? []).filter(
    (incident) => incident.status !== "resolved",
  );
  const incidentState: ServiceState = activeIncidents.some(
    (incident) => incident.impact === "major" || incident.impact === "critical",
  )
    ? "outage"
    : activeIncidents.length
      ? "degraded"
      : "operational";
  const states = services.map((item) => item.state);
  const overall: ServiceState =
    incidentState === "outage" || states.includes("outage")
      ? "outage"
      : incidentState === "degraded" || states.includes("degraded")
        ? "degraded"
        : states.includes("unknown")
          ? "unknown"
          : "operational";
  return {
    checked_at: checkedAt,
    overall,
    services,
    incidents: input.incidents ?? [],
  };
}

const cachedPublicStatus=unstable_cache(async()=>fetchPublicStatus(),["public-status-v1"],{revalidate:60,tags:["public-status"]});

export function getPublicStatus(): Promise<PublicStatus> { return cachedPublicStatus(); }

async function fetchPublicStatus(): Promise<PublicStatus> {
  const runner = await getDeepScanHealth();
  const since = new Date(Date.now() - 24 * 60 * 60_000).toISOString();
  try {
    if (cloudflarePrivateAvailable()) {
      return await fetchCloudflarePublicStatus(privateDb(), runner, since);
    }
    // Wrangler injects production secrets through the request context, not
    // process.env. Prefer that client so the status probe measures the real
    // primary store instead of always falling back to the public mirror.
    const db = serviceDb();
    const [probe, refresh, scans, deliveries, incidents] = await Promise.all([
      db
        .from("registry_refreshes")
        .select("registry", { head: true, count: "exact" })
        .limit(1),
      db
        .from("registry_refreshes")
        .select("completed_at")
        .eq("status", "complete")
        .order("completed_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      db
        .from("scans")
        .select("analysis_status")
        .gte("scanned_at", since)
        .limit(2000),
      db
        .from("team_notification_deliveries")
        .select("status")
        .gte("created_at", since)
        .limit(2000),
      db
        .from("public_status_incidents")
        .select("id,title,status,impact,started_at,resolved_at,summary")
        .order("started_at", { ascending: false })
        .limit(20),
    ]);
    const scanRows = (scans.data ?? []) as Array<{ analysis_status?: string }>;
    const deliveryRows = (deliveries.data ?? []) as Array<{ status?: string }>;
    return evaluatePublicStatus({
      runner,
      databaseReachable: !probe.error,
      newestRegistryRefresh: refresh.data?.completed_at
        ? String(refresh.data.completed_at)
        : null,
      scanFailureRate: scans.error
        ? null
        : ratio(
            scanRows.filter((row) => row.analysis_status === "failed").length,
            scanRows.length,
          ),
      notificationFailureRate: deliveries.error
        ? null
        : ratio(
            deliveryRows.filter((row) => row.status === "failed").length,
            deliveryRows.length,
          ),
      incidents: incidents.error ? [] : (incidents.data as PublicIncident[]),
    });
  } catch (error) {
    console.error(
      "[public-status] primary data store probe failed",
      error instanceof Error ? error.message : String(error),
    );
    const mirror = await getPublicRegistrySnapshot();
    if (mirror) {
      const refreshes = Object.values(mirror.metrics.freshness).filter(
        (value): value is string => Boolean(value),
      );
      return evaluatePublicStatus({
        runner,
        databaseReachable: false,
        publicMirrorAvailable: true,
        newestRegistryRefresh: refreshes.sort().at(-1) || mirror.generated_at,
        scanFailureRate: null,
        notificationFailureRate: null,
      });
    }
    return evaluatePublicStatus({
      runner,
      databaseReachable: false,
      newestRegistryRefresh: null,
      scanFailureRate: null,
      notificationFailureRate: null,
    });
  }
}

async function fetchCloudflarePublicStatus(
  db: PrivateDatabase,
  runner: Awaited<ReturnType<typeof getDeepScanHealth>>,
  since: string,
): Promise<PublicStatus> {
  const probe = await db.prepare("SELECT 1 AS ok").first<{ ok?: number }>();
  if (!probe) throw new Error("Cloudflare D1 health probe returned no result.");
  const refreshPromise = getCloudflareRegistryPublication(),
    scansPromise = db
      .prepare("SELECT status,error FROM app_scan_jobs WHERE profile='deep' AND status IN ('complete','failed') AND COALESCE(completed_at,updated_at)>=?")
      .bind(since)
      .all<{ status?: string; error?: string | null }>(),
    deliveriesPromise = db
      .prepare("SELECT status FROM app_notification_deliveries WHERE created_at>=?")
      .bind(since)
      .all<{ status?: string }>(),
    teamsPromise = db.prepare("SELECT state_json FROM app_team_state").all<{ state_json?: string }>();
  const [refresh, scans, deliveries, teams] = await Promise.all([
    refreshPromise.catch(() => null),
    scansPromise.catch(() => ({ results: [] as Array<{ status?: string; error?: string | null }> })),
    deliveriesPromise.catch(() => ({ results: [] as Array<{ status?: string }> })),
    teamsPromise.catch(() => ({ results: [] as Array<{ state_json?: string }> })),
  ]);

  // Dispatch failures are represented by Deep Scan health. They are not
  // analyzer failures and must not inflate the publication failure rate.
  const scanRows = scans?.results || [];
  const analyzedScans = scanRows.filter(
    (row) => !String(row.error || "").toLowerCase().includes("dispatch failed"),
  );
  const scanFailures = analyzedScans.filter((row) => row.status === "failed").length;
  const deliveryRows = deliveries?.results || [];
  return evaluatePublicStatus({
    runner,
    databaseReachable: true,
    newestRegistryRefresh: refresh?.generated_at ? String(refresh.generated_at) : null,
    scanFailureRate: ratio(scanFailures, analyzedScans.length),
    notificationFailureRate: ratio(
      deliveryRows.filter((row) => row.status === "failed").length,
      deliveryRows.length,
    ),
    notificationConfigured: Boolean(teams?.results?.some((row) => hasConfiguredNotificationChannel(row.state_json))),
    incidents: [],
  });
}

function hasConfiguredNotificationChannel(stateJson: string | undefined): boolean {
  try {
    const state = JSON.parse(stateJson || "{}");
    return Array.isArray(state?.channels)
      && state.channels.some(
        (channel: unknown) => channel && typeof channel === "object"
          && (channel as { enabled?: unknown }).enabled !== false
          && typeof (channel as { target?: unknown }).target === "string"
          && Boolean((channel as { target: string }).target.trim()),
      );
  } catch {
    return false;
  }
}

function service(
  id: string,
  name: string,
  description: string,
  state: ServiceState,
  detail: string,
  checked_at: string,
): PublicService {
  return { id, name, description, state, detail, checked_at };
}
function ratio(failures: number, total: number) {
  return total ? failures / total : null;
}
function rateState(rate: number | null): ServiceState {
  return rate === null
    ? "unknown"
    : rate >= 0.2
      ? "outage"
      : rate >= 0.05
        ? "degraded"
        : "operational";
}
function rateDetail(rate: number | null, noun: string) {
  return rate === null
    ? `No recent ${noun} sample is available.`
    : `${Math.round(rate * 100)}% ${noun} failure rate in the last 24 hours.`;
}
function formatAge(milliseconds: number) {
  const minutes = Math.max(0, Math.round(milliseconds / 60_000));
  return minutes < 60 ? `${minutes} min` : `${Math.round(minutes / 60)} hr`;
}
