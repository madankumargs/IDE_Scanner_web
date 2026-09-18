import { NextResponse } from "next/server";
import { dispatchDeepScan, withAnonymousKey } from "@/lib/deepScan";
import { serviceDb } from "@/lib/supabase";
import { serverDb } from "@/lib/supabaseServer";
import { scanProgressColumns, scanProgressPayload } from "@/lib/scanProgress";
import { cloudflarePrivateAvailable, cloudflareScanProgress, withAnonymousCloudflareKey } from "@/lib/cloudflareDeepScan";
import { anonymousRequesterHash, privateDb, userFromSession } from "@/lib/cloudflarePrivate";

export const dynamic = "force-dynamic";

// A queued/running job only becomes terminal when the signed worker callback
// lands. When that callback is lost the job would otherwise poll forever, so
// the poller reconciles past-deadline jobs itself: the RPC only touches rows
// with an expired lease or a queued job older than the grace window, making the
// watching UI its own backstop even if no GitHub worker ever fires.
const QUEUE_GRACE_MINUTES = 20;

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  try {
    if (cloudflarePrivateAvailable()) {
      const db = privateDb();
      const user = await userFromSession(request);
      if (user) {
        const subscription = await db.prepare("SELECT job_id FROM app_scan_job_subscribers WHERE job_id=? AND user_id=?").bind(id, user.id).first<Record<string, unknown>>();
        if (subscription) {
          const job = await db.prepare("SELECT * FROM app_scan_jobs WHERE id=?").bind(id).first<Record<string, unknown>>();
          if (job) return NextResponse.json(await cloudflareScanProgress(job));
        }
      }
      const hash = anonymousRequesterHash(request);
      const anon = await db.prepare("SELECT * FROM app_scan_jobs WHERE id=? AND requester_hash=? AND requested_by IS NULL").bind(id, hash).first<Record<string, unknown>>();
      if (anon) {
        const payload = await cloudflareScanProgress(anon);
        return NextResponse.json(withAnonymousCloudflareKey(payload as Record<string, unknown> & { extension_id?: string; version?: string; status?: string }, id));
      }
      if (user) return NextResponse.json({ error: "Scan job not found." }, { status: 404 });
      return NextResponse.json({ error: "Scan job not found. Sign in to view scans from another device.", code: "auth_required" }, { status: 404 });
    }
    const db=await serverDb(); const {data:{user}}=await db.auth.getUser();
    const service = serviceDb();
    if(user){
      const subscription = await service.from("scan_job_subscribers").select("job_id").eq("job_id", id).eq("user_id", user.id).maybeSingle();
      if (!subscription.error && subscription.data) {
        const { data, error } = await service.from("scan_jobs").select(scanProgressColumns).eq("id", id).maybeSingle();
        if (!error && data) {
          if (data.status === "queued" && !data.github_run_id) await dispatchDeepScan(String(data.id), 120).catch(() => false);
          if (isStale(data)) {
            const reconciled = await service.rpc("reconcile_stale_deep_scans", { p_queue_grace_minutes: QUEUE_GRACE_MINUTES });
            if (!reconciled.error) {
              const refreshed = await service.from("scan_jobs").select(scanProgressColumns).eq("id", id).maybeSingle();
              if (!refreshed.error && refreshed.data) return NextResponse.json(await scanProgressPayload(service, refreshed.data));
            }
          }
          return NextResponse.json(await scanProgressPayload(service, data));
        }
      }
    }
    const anonHash = anonymousRequesterHash(request);
    const { data: anonData, error: anonError } = await service.from("scan_jobs").select(scanProgressColumns).eq("id", id).eq("requester_hash", anonHash).is("requested_by", null).maybeSingle();
    if (anonError) throw anonError;
    if (!anonData) return NextResponse.json({ error: "Scan job not found. Sign in to view scans from another device.", code: "auth_required" }, { status: 404 });
    if (anonData.status === "queued" && !anonData.github_run_id) await dispatchDeepScan(String(anonData.id), 120).catch(() => false);
    if (isStale(anonData)) {
      const reconciled = await service.rpc("reconcile_stale_deep_scans", { p_queue_grace_minutes: QUEUE_GRACE_MINUTES });
      if (!reconciled.error) {
        const refreshed = await service.from("scan_jobs").select(scanProgressColumns).eq("id", id).eq("requester_hash", anonHash).is("requested_by", null).maybeSingle();
        if (!refreshed.error && refreshed.data) {
          const payload = await scanProgressPayload(service, refreshed.data);
          return NextResponse.json(withAnonymousKey(payload as Record<string, unknown>, id));
        }
      }
    }
    const payload = await scanProgressPayload(service, anonData);
    return NextResponse.json(withAnonymousKey(payload as Record<string, unknown>, id));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Scan lookup failed." }, { status: 502 });
  }
}

function isStale(job: Record<string, unknown>): boolean {
  const status = String(job.status);
  const now = Date.now();
  if (status === "running") {
    const lease = job.lease_expires_at ? new Date(String(job.lease_expires_at)).getTime() : NaN;
    return Number.isFinite(lease) && lease < now;
  }
  if (status === "queued") {
    const created = job.created_at ? new Date(String(job.created_at)).getTime() : NaN;
    return Number.isFinite(created) && now - created > QUEUE_GRACE_MINUTES * 60_000;
  }
  return false;
}
