import { NextResponse } from "next/server";
import { getPublicInventory } from "@/lib/productData";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const requestedLimit = Number.parseInt(url.searchParams.get("limit") || "240", 10);
  const requestedOffset = Number.parseInt(url.searchParams.get("offset") || "0", 10);
  const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 240) : 240;
  const offset = Number.isFinite(requestedOffset) ? Math.min(Math.max(requestedOffset, 0), 10000) : 0;
  return NextResponse.json(await getPublicInventory(limit, offset), { headers: { "Cache-Control": "public, max-age=60, s-maxage=300" } });
}
