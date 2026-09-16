import { NextResponse } from "next/server";
import { cloudflarePrivateAvailable } from "@/lib/cloudflareDeepScan";
import { privateDb } from "@/lib/cloudflarePrivate";
import { serviceDb } from "@/lib/supabase";
import { badgePublicPaths, normalizeTeamBadge } from "@/lib/teamBadges";
import { runtimeEnv } from "@/lib/runtimeEnv";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ slug: string }> };

/** Public Trust Card projection. It intentionally has no team membership, audit, or scan-job fields. */
export async function GET(_request: Request, context: Context) {
  if (runtimeEnv("TEAM_BADGE_WALL_ENABLED").toLowerCase() === "false") return notFound();
  const { slug: rawSlug } = await context.params;
  const slug = rawSlug.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{1,100}$/.test(slug)) return notFound();
  try {
    const result = cloudflarePrivateAvailable() ? await cloudflareWall(slug) || await supabaseWall(slug) : await supabaseWall(slug);
    if (!result) return notFound();
    return NextResponse.json(result, { headers: { "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=3600" } });
  } catch {
    return notFound();
  }
}

async function cloudflareWall(slug: string) {
  const db = privateDb();
  const team = await db.prepare("SELECT id,slug FROM app_teams WHERE lower(slug)=? LIMIT 1").bind(slug).first<Record<string, unknown>>();
  if (!team) return null;
  const badges = await db.prepare("SELECT * FROM app_team_badges WHERE team_id=? AND visibility='public' AND status IN ('ready','stale') AND revoked_at IS NULL ORDER BY extension_id,version").bind(String(team.id)).all<Record<string, unknown>>();
  return wallResponse(String(team.slug), badges.results);
}

async function supabaseWall(slug: string) {
  const db = serviceDb();
  const team = await db.from("teams").select("id,slug").eq("slug", slug).maybeSingle();
  if (team.error) throw team.error;
  if (!team.data) return null;
  const badges = await db.from("team_badges").select("*").eq("team_id", team.data.id).eq("visibility", "public").in("status", ["ready", "stale"]).is("revoked_at", null).order("extension_id").order("version");
  if (badges.error) throw badges.error;
  return wallResponse(String(team.data.slug), (badges.data || []) as Array<Record<string, unknown>>);
}

function wallResponse(slug: string, rows: Array<Record<string, unknown>>) {
  return {
    schema: "guardrails.public-trust-card.v1",
    team: { slug },
    badges: rows.map((row) => {
      const badge = normalizeTeamBadge(row);
      if (!badge) return null;
      const paths = badgePublicPaths(badge);
      return {
        extension_id: badge.extension_id,
        display_name: badge.display_name,
        version: badge.version,
        status: badge.status,
        trust_tier: badge.trust_tier,
        trust_label: badge.trust_label,
        coverage_percent: badge.coverage_percent,
        risk_score: badge.risk_score,
        malware_score: badge.malware_score,
        scanned_at: badge.scanned_at,
        badge_url: paths.badge,
        report_url: paths.report,
      };
    }).filter(Boolean),
    updated_at: new Date().toISOString(),
  };
}

function notFound() {
  return NextResponse.json({ error: "Trust card not found." }, { status: 404 });
}
