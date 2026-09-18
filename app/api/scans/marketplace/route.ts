import { NextResponse } from "next/server";
import { queueAnonymousDeepScan, queueDeepScan } from "@/lib/deepScan";
import { normalizeMarketplaceId } from "@/lib/marketplace";
import { serverDb } from "@/lib/supabaseServer";
import { queueAnonymousCloudflareDeepScan } from "@/lib/cloudflareDeepScan";
import { cloudflarePrivateAvailable } from "@/lib/cloudflareDeepScan";
import { FreeScanLimitError } from "@/lib/cloudflarePrivate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const payload = await request.json().catch(() => ({})) as { ids?: unknown; id?: unknown; version?: unknown };
  const raw = Array.isArray(payload.ids) ? payload.ids[0] : payload.id;
  if (typeof raw !== "string" || !raw.trim()) return NextResponse.json({ error: "Provide one marketplace extension id or URL." }, { status: 400 });
  const version = typeof payload.version === "string" ? payload.version.trim() || undefined : undefined;
  const extensionId = normalizeMarketplaceId(raw);
  try {
    if (cloudflarePrivateAvailable()) {
      try {
        const { userFromSession } = await import("@/lib/cloudflarePrivate");
        const user = await userFromSession(request);
        if (user) {
          const result = await queueDeepScan(extensionId, version, request, user.id);
          return NextResponse.json(result, { status: String(result.status) === "complete" ? 200 : 202 });
        }
      } catch { /* fall through to anonymous */ }
      const result = await queueAnonymousCloudflareDeepScan(extensionId, version, request);
      return NextResponse.json(result, { status: String(result.status) === "complete" ? 200 : 202 });
    }
    const db = await serverDb();
    const { data: { user } } = await db.auth.getUser();
    if (user) {
      const result = await queueDeepScan(extensionId, version, request, user.id);
      return NextResponse.json(result, { status: String(result.status) === "complete" ? 200 : 202 });
    }
    const result = await queueAnonymousDeepScan(extensionId, version, request);
    return NextResponse.json(result, { status: String(result.status) === "complete" ? 200 : 202 });
  } catch (error) {
    if (error instanceof FreeScanLimitError || (error instanceof Error && error.name === "FreeScanLimitError"))
      return NextResponse.json({ error: error.message, code: "free_scan_used", sign_in_required: true }, { status: 403 });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Canonical Deep Scan failed." }, { status: 400 });
  }
}
