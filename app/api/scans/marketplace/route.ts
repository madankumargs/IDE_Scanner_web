import { NextResponse } from "next/server";
import { authenticated } from "@/lib/auth";
import { queueDeepScan } from "@/lib/deepScan";
import { normalizeMarketplaceId } from "@/lib/marketplace";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const payload = await request.json().catch(() => ({})) as { ids?: unknown; id?: unknown; version?: unknown };
  const raw = Array.isArray(payload.ids) ? payload.ids[0] : payload.id;
  if (typeof raw !== "string" || !raw.trim()) return NextResponse.json({ error: "Provide one marketplace extension id or URL." }, { status: 400 });
  let user: { id: string };
  try {
    ({ user } = await authenticated(request));
  } catch {
    return NextResponse.json({ error: "Sign in to run the canonical Deep Scan.", code: "auth_required" }, { status: 401 });
  }
  try {
    const result = await queueDeepScan(normalizeMarketplaceId(raw), typeof payload.version === "string" ? payload.version.trim() || undefined : undefined, request, user.id);
    return NextResponse.json(result, { status: String(result.status) === "complete" ? 200 : 202 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Canonical Deep Scan failed." }, { status: 400 });
  }
}
