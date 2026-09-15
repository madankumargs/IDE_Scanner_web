import { NextResponse } from "next/server";
import { authenticated } from "@/lib/auth";
import { normalizeMarketplaceId } from "@/lib/marketplace";
import { serviceDb } from "@/lib/supabase";
import { serverDb } from "@/lib/supabaseServer";
import { DeepScanUnavailableError, queueDeepScan } from "@/lib/deepScan";
import { scanProgressColumns, scanProgressPayload } from "@/lib/scanProgress";
import { cloudflareGuestTrialStatus, cloudflarePrivateAvailable, cloudflareScanProgress, getCloudflareGuestJobForRelease, GuestTrialLimitError, guestTrialToken, guestTrialCookie, queueCloudflareGuestDeepScan } from "@/lib/cloudflareDeepScan";
import { newSessionToken, privateDb } from "@/lib/cloudflarePrivate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function cloudflareAuthenticatedUser(request: Request) {
  try {
    return (await authenticated(request)).user;
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  try {
    if (cloudflarePrivateAvailable()) {
      const url = new URL(request.url);
      const extensionId = normalizeMarketplaceId(url.searchParams.get("extension_id") || "");
      const version = (url.searchParams.get("version") || "").trim();
      const user = await cloudflareAuthenticatedUser(request);
      if (!user) {
        const guestJob = await getCloudflareGuestJobForRelease(extensionId, version, guestTrialToken(request));
        const trial = await cloudflareGuestTrialStatus(request);
        if (guestJob) return NextResponse.json({ ...(await cloudflareScanProgress(guestJob)), guest_trial_available: trial.available, guest_trial_remaining: trial.remaining, guest_trial_limit: trial.limit, guest_trial_window_days: trial.window_days });
        return NextResponse.json({ guest_trial_available: trial.available, guest_trial_remaining: trial.remaining, guest_trial_limit: trial.limit, guest_trial_window_days: trial.window_days, auth_required: !trial.available });
      }
      const db = privateDb();
      const job = await db.prepare(`SELECT j.* FROM app_scan_jobs j JOIN app_scan_job_subscribers s ON s.job_id=j.id WHERE s.user_id=? AND j.extension_id=? ${version ? "AND j.version=?" : ""} ORDER BY j.created_at DESC LIMIT 1`).bind(...(version ? [user.id, extensionId, version] : [user.id, extensionId])).first<Record<string, unknown>>();
      return job ? NextResponse.json(await cloudflareScanProgress(job)) : new NextResponse(null, { status: 204 });
    }
    const db = await serverDb();
    const {
      data: { user },
    } = await db.auth.getUser();
    if (!user)
      return NextResponse.json(
        { error: "Sign in to view Deep Scan progress.", code: "auth_required" },
        { status: 401 },
      );
    const url = new URL(request.url);
    const extensionId = normalizeMarketplaceId(
      url.searchParams.get("extension_id") || "",
    );
    const version = (url.searchParams.get("version") || "").trim();
    const service = serviceDb();
    const subscriptions = await service
      .from("scan_job_subscribers")
      .select("job_id")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50);
    if (subscriptions.error) throw subscriptions.error;
    const jobIds = (subscriptions.data || []).map((item) =>
      String(item.job_id),
    );
    if (!jobIds.length) return new NextResponse(null, { status: 204 });
    let query = service
      .from("scan_jobs")
      .select(scanProgressColumns)
      .in("id", jobIds)
      .eq("extension_id", extensionId)
      .order("created_at", { ascending: false })
      .limit(1);
    if (version) query = query.eq("version", version);
    const result = await query.maybeSingle();
    if (result.error) throw result.error;
    return result.data
      ? NextResponse.json(await scanProgressPayload(service, result.data))
      : new NextResponse(null, { status: 204 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Scan lookup failed." },
      { status: 400 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json().catch(() => ({}))) as {
      extension_id?: string;
      version?: string;
      force?: boolean;
    };
    if (cloudflarePrivateAvailable()) {
      const user = await cloudflareAuthenticatedUser(request);
      const extensionId = normalizeMarketplaceId(String(payload.extension_id || ""));
      if (!user) {
        const token = guestTrialToken(request) || newSessionToken();
        const result = await queueCloudflareGuestDeepScan(extensionId, payload.version?.trim() || undefined, request, token, payload.force === true);
        const response = NextResponse.json(result, { status: String(result.status) === "complete" ? 200 : 202 });
        response.headers.append("Set-Cookie", guestTrialCookie(token));
        return response;
      }
      const result = await queueDeepScan(extensionId, payload.version?.trim() || undefined, request, user.id, payload.force === true);
      return NextResponse.json(result, { status: String(result.status) === "complete" ? 200 : 202 });
    }
    const db = await serverDb();
    const {
      data: { user },
    } = await db.auth.getUser();
    if (!user)
      return NextResponse.json(
        { error: "Sign in to request a Deep Scan.", code: "auth_required" },
        { status: 401 },
      );
    const extensionId = normalizeMarketplaceId(
      String(payload.extension_id || ""),
    );
    const result = await queueDeepScan(
      extensionId,
      payload.version?.trim() || undefined,
      request,
      user.id,
      payload.force === true,
    );
    return NextResponse.json(result, {
      status: String(result.status) === "complete" ? 200 : 202,
    });
  } catch (error) {
    if (error instanceof GuestTrialLimitError || (error instanceof Error && error.name === "GuestTrialLimitError")) return NextResponse.json({ error: error.message, code: "guest_trial_exhausted" }, { status: 429 });
    if (
      error instanceof DeepScanUnavailableError ||
      (error instanceof Error && error.name === "DeepScanUnavailableError")
    )
      return NextResponse.json(
        {
          error: "Deep Scan is temporarily unavailable.",
          code: "configuration_unavailable",
        },
        { status: 503 },
      );
    const message =
      error instanceof Error
        ? error.message
        : "Deep Scan could not be requested.";
    return NextResponse.json(
      { error: message, code: "scan_unavailable" },
      { status: 400 },
    );
  }
}
