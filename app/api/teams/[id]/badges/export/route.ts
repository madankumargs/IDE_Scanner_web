import { NextResponse } from "next/server";
import { authenticated } from "@/lib/auth";
import { privateDb } from "@/lib/cloudflarePrivate";
import { serviceDb } from "@/lib/supabase";
import { requireTeamRole } from "@/lib/teams";
import { teamApiError } from "@/lib/teamApiError";
import { presentTeamBadge, type PresentedTeamBadge } from "@/lib/teamBadgePresentation";
import { renderBadgeMarkdown, renderBadgeSnippets, exportBadgeRecord } from "@/lib/teamBadgeExport";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Context) {
  try {
    const { user, provider } = await authenticated(request);
    const { id } = await context.params;
    const role = await requireTeamRole(id, user.id, ["owner", "admin", "analyst"]);
    const url = new URL(request.url);
    const format = url.searchParams.get("format") || "markdown";
    if (!["markdown", "snippets", "json"].includes(format)) return NextResponse.json({ error: "Export format must be markdown, snippets, or json." }, { status: 400 });
    const requestedIds = new Set((url.searchParams.get("ids") || "").split(",").map((value) => value.trim()).filter(Boolean));
    const badges = (provider === "cloudflare" ? await cloudflareBadges(id) : await supabaseBadges(id))
      .filter((badge): badge is PresentedTeamBadge => Boolean(badge))
      .filter((badge) => !requestedIds.size || requestedIds.has(badge.id));
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || new URL(request.url).origin;
    const filename = format === "json" ? "guardrails-trust-inventory.json" : format === "snippets" ? "guardrails-badge-snippets.md" : "GUARDRAILS.md";
    if (format === "json") {
      return new Response(JSON.stringify({ schema: "guardrails.team-badges.v1", generated_at: new Date().toISOString(), exported_by_role: role, badges: badges.map(exportBadgeRecord) }, null, 2), { headers: downloadHeaders(filename, "application/json") });
    }
    const body = format === "snippets" ? renderBadgeSnippets(badges, siteUrl) : renderBadgeMarkdown(badges, siteUrl);
    return new Response(body, { headers: downloadHeaders(filename, "text/markdown; charset=utf-8") });
  } catch (error) {
    const failure = teamApiError(error, "Badge export is temporarily unavailable.");
    return NextResponse.json({ error: failure.error }, { status: failure.status });
  }
}

async function cloudflareBadges(teamId: string): Promise<PresentedTeamBadge[]> {
  const result = await privateDb().prepare("SELECT * FROM app_team_badges WHERE team_id=? ORDER BY extension_id,version").bind(teamId).all<Record<string, unknown>>();
  return result.results.map((row) => presentTeamBadge(row)).filter((badge): badge is PresentedTeamBadge => Boolean(badge));
}

async function supabaseBadges(teamId: string): Promise<PresentedTeamBadge[]> {
  const result = await serviceDb().from("team_badges").select("*").eq("team_id", teamId).order("extension_id").order("version");
  if (result.error) throw result.error;
  return (result.data || []).map((row) => presentTeamBadge(row)).filter((badge): badge is PresentedTeamBadge => Boolean(badge));
}

function downloadHeaders(filename: string, contentType: string): HeadersInit {
  return { "Content-Type": contentType, "Content-Disposition": `attachment; filename="${filename}"`, "Cache-Control": "private, no-store", "X-GuardRails-Export": "team-badges-v1" };
}
