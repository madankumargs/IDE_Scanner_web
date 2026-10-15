import { NextResponse } from "next/server";
import { searchMarketplace } from "@/lib/marketplace";
import { buildDiscoveryResponse } from "@/lib/discovery";
import { unstable_cache } from "next/cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const cachedSearch=unstable_cache(async(query:string)=>searchMarketplace(query),["registry-search-v3"],{revalidate:3600,tags:["registry-search"]});

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q")?.trim() || "";
  if (!query) return NextResponse.json(buildDiscoveryResponse("", []));
  try {
    const results=await Promise.race([cachedSearch(query),new Promise<never>((_,reject)=>setTimeout(()=>reject(new Error("Extension registries are responding slowly. Try the exact publisher.extension identifier.")),8000))]);
    return NextResponse.json(buildDiscoveryResponse(query, results, "registry-cache"), {
      headers: { "Cache-Control": "public, max-age=60, s-maxage=3600, stale-while-revalidate=86400" },
    });
  } catch {
    return NextResponse.json({ error: "Registry search is temporarily unavailable. Retry with an exact publisher.extension identifier; this does not mean the extension was not found.", code: "registry_unavailable", results: [] }, { status: 502 });
  }
}
