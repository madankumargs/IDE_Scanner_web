import { NextResponse } from "next/server";
import { recommendedPublicSkills, searchPublicSkills } from "@/lib/skillsCatalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = url.searchParams.get("q")?.trim() || "";
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit") || 24) || 24, 1), 50);
  try {
    const payload = query ? await searchPublicSkills(query, limit) : await recommendedPublicSkills(Math.min(limit, 12));
    return NextResponse.json(payload, { headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "The public Skills catalog is unavailable." }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
