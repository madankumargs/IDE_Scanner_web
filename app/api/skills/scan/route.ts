import { NextResponse } from "next/server";
import { scanPublicGitHubSkill, SkillScanError } from "@/lib/skillsScanner";
import { persistSkillScanReport } from "@/lib/skillsScanStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const payload = (await request.json().catch(() => ({}))) as { source_url?: unknown };
    const sourceUrl = typeof payload.source_url === "string" ? payload.source_url.trim() : "";
    if (!sourceUrl || sourceUrl.length > 500) return NextResponse.json({ error: "Provide one public GitHub Skill URL." }, { status: 400, headers: { "cache-control": "no-store" } });
    const report = await scanPublicGitHubSkill(sourceUrl);
    let storage: { persisted: boolean; scanId?: string; error?: string } = { persisted: false };
    try {
      const stored = await persistSkillScanReport(report);
      storage = { persisted: true, scanId: stored.scanId };
    } catch (error) {
      console.error("[skills-scan] report persistence failed", error instanceof Error ? error.message : String(error));
      storage = { persisted: false, error: "The scan completed, but report persistence is unavailable." };
    }
    return NextResponse.json({ ...report, storage }, { status: 200, headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof SkillScanError) return NextResponse.json({ error: error.message, code: error.code }, { status: error.status, headers: { "cache-control": "no-store" } });
    return NextResponse.json({ error: "The Skill source could not be scanned safely.", code: "scan_failed" }, { status: 502, headers: { "cache-control": "no-store" } });
  }
}
