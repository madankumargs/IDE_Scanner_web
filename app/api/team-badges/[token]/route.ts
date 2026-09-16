import { NextResponse } from "next/server";
import { cloudflarePrivateAvailable, getCloudflareScanProduct } from "@/lib/cloudflareDeepScan";
import { privateDb } from "@/lib/cloudflarePrivate";
import { serviceDb } from "@/lib/supabase";
import { renderTrustBadgeSvg } from "@/lib/badgeSvg";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ token: string }> };

export async function GET(_request: Request, context: Context) {
  const { token: rawToken } = await context.params;
  const token = rawToken.trim();
  if (!/^[A-Za-z0-9_-]{8,160}$/.test(token)) return notFound();

  try {
    if (cloudflarePrivateAvailable()) {
      const badge = await privateDb()
        .prepare("SELECT * FROM app_team_badges WHERE public_token=? AND visibility='public' AND status IN ('ready','stale') AND revoked_at IS NULL LIMIT 1")
        .bind(token)
        .first<Record<string, unknown>>();
      if (!badge) return notFound();
      const product = await getCloudflareScanProduct(String(badge.extension_id), String(badge.version), String(badge.scan_id || ""));
      const scan = product?.scan && typeof product.scan === "object" ? product.scan as Record<string, unknown> : null;
      return scan ? renderTrustBadgeSvg(scan) : notFound();
    }

    const db = serviceDb();
    const badgeResult = await db
      .from("team_badges")
      .select("id,extension_id,version,scan_id,status,visibility,revoked_at")
      .eq("public_token", token)
      .eq("visibility", "public")
      .maybeSingle();
    if (badgeResult.error) throw badgeResult.error;
    const badge = badgeResult.data as Record<string, unknown> | null;
    if (!badge || !["ready", "stale"].includes(String(badge.status)) || badge.revoked_at) return notFound();
    const scanResult = await db
      .from("scans")
      .select("id,extension_id,version,analysis_status,decision,verdict,public_outcome,analysis_coverage,capability_assessment,risk_score,malware_score,scanned_at")
      .eq("id", String(badge.scan_id || ""))
      .eq("extension_id", String(badge.extension_id || ""))
      .eq("version", String(badge.version || ""))
      .maybeSingle();
    if (scanResult.error) throw scanResult.error;
    const scan = scanResult.data as Record<string, unknown> | null;
    return scan?.analysis_status === "complete" ? renderTrustBadgeSvg(scan) : notFound();
  } catch {
    return notFound();
  }
}

function notFound() {
  return NextResponse.json({ error: "Badge not found." }, { status: 404 });
}
