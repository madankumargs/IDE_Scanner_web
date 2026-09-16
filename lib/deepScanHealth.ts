import { serviceDb } from "@/lib/supabase";
import { cloudflarePrivateAvailable } from "@/lib/cloudflareDeepScan";
import { getCloudflareRunnerHeartbeat } from "@/lib/cloudflareRunnerStatus";
import { privateDb } from "@/lib/cloudflarePrivate";
import { runtimeEnv } from "@/lib/runtimeEnv";

export type DeepScanHealth = {
  accepting_requests: boolean;
  status: "ready" | "runner_delayed" | "configuration_unavailable";
  last_seen_at: string | null;
};

export async function getDeepScanHealth(): Promise<DeepScanHealth> {
  if (cloudflarePrivateAvailable()) {
    if (!runtimeEnv("GITHUB_ACTIONS_TOKEN")) return { accepting_requests: false, status: "configuration_unavailable", last_seen_at: null };
    try {
      const lastSeen = await getCloudflareRunnerHeartbeat(privateDb());
      const recent = lastSeen ? Date.now() - new Date(lastSeen).getTime() < 12 * 60_000 : false;
      return { accepting_requests: true, status: recent ? "ready" : "runner_delayed", last_seen_at: lastSeen };
    } catch {
      return { accepting_requests: true, status: "runner_delayed", last_seen_at: null };
    }
  }
  if (!process.env.SCAN_RUNNER_SECRET || !process.env.GITHUB_ACTIONS_TOKEN) {
    return { accepting_requests: false, status: "configuration_unavailable", last_seen_at: null };
  }
  let result: { data: { last_seen_at?: string | null } | null; error: unknown };
  try {
    result = await serviceDb().from("scan_runner_status").select("last_seen_at").eq("id", "github-actions").maybeSingle();
  } catch {
    return { accepting_requests: false, status: "configuration_unavailable", last_seen_at: null };
  }
  // GitHub schedules are best-effort. A delayed heartbeat must not prevent a valid
  // signed-in user from queueing work for the next runner invocation.
  if (result.error || !result.data?.last_seen_at) return { accepting_requests: true, status: "runner_delayed", last_seen_at: null };
  const lastSeen = String(result.data.last_seen_at);
  const recent = Date.now() - new Date(lastSeen).getTime() < 12 * 60_000;
  return { accepting_requests: true, status: recent ? "ready" : "runner_delayed", last_seen_at: lastSeen };
}
