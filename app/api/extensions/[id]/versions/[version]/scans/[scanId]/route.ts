import { NextResponse } from "next/server";
import { getVersionScanProduct } from "@/lib/productData";
import { serverDb } from "@/lib/supabaseServer";
import { cloudflarePrivateAvailable } from "@/lib/cloudflareDeepScan";
import { reportAccessUser } from "@/lib/reportAccess";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string; version: string; scanId: string }> }) {
  const user = await reportAccessUser(request);
  if (!user) return NextResponse.json({ error: "Sign in to access the full report.", code: "auth_required" }, { status: 401, headers: { "Cache-Control": "private, no-store" } });
  const route = await context.params;
  const client = cloudflarePrivateAvailable() ? undefined : await serverDb();
  const product = await getVersionScanProduct(decodeURIComponent(route.id), decodeURIComponent(route.version), decodeURIComponent(route.scanId), client, { skipCloudflareCatalog: true });
  return product ? NextResponse.json(product) : NextResponse.json({ error: "That immutable scan does not belong to this exact artifact." }, { status: 404 });
}
