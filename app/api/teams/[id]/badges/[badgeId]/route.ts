import { NextResponse } from "next/server";
import { authenticated } from "@/lib/auth";
import { audit, getWorkspaceState } from "@/lib/cloudflareWorkspace";
import { nowIso, privateDb } from "@/lib/cloudflarePrivate";
import { serviceDb } from "@/lib/supabase";
import { requireTeamRole } from "@/lib/teams";
import { teamApiError } from "@/lib/teamApiError";
import {
  normalizeTeamBadge,
  transitionTeamBadgeStatus,
  type TeamBadge,
  type TeamBadgeVisibility,
} from "@/lib/teamBadges";
import { presentTeamBadge, type PresentedTeamBadge } from "@/lib/teamBadgePresentation";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string; badgeId: string }> };

export async function GET(_request: Request, context: Context) {
  try {
    const { user, provider } = await authenticated(_request);
    const { id, badgeId } = await context.params;
    await requireTeamRole(id, user.id, ["owner", "admin", "analyst", "viewer"]);
    const badge = provider === "cloudflare"
      ? await loadCloudflareBadge(id, badgeId)
      : await loadSupabaseBadge(id, badgeId);
    if (!badge) return notFound();
    return NextResponse.json({ badge });
  } catch (error) {
    const failure = teamApiError(error, "The team badge is temporarily unavailable.");
    return NextResponse.json({ error: failure.error }, { status: failure.status });
  }
}

export async function PATCH(request: Request, context: Context) {
  try {
    const { user, provider } = await authenticated(request);
    const { id, badgeId } = await context.params;
    await requireTeamRole(id, user.id, ["owner", "admin"]);
    const input = await parsePatch(request);
    const badge = provider === "cloudflare"
      ? await mutateCloudflareBadge(id, badgeId, user.id, input)
      : await mutateSupabaseBadge(id, badgeId, user.id, input);
    return NextResponse.json({ badge });
  } catch (error) {
    if (error instanceof BadgeValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof BadgeConflictError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    if (error instanceof BadgeNotFoundError) {
      return notFound();
    }
    const failure = teamApiError(error, "The team badge could not be updated.");
    return NextResponse.json({ error: failure.error }, { status: failure.status });
  }
}

type BadgePatch = {
  visibility?: TeamBadgeVisibility;
  revoke: boolean;
};

async function parsePatch(request: Request): Promise<BadgePatch> {
  const body = await request.json().catch(() => ({}));
  const hasVisibility = Object.prototype.hasOwnProperty.call(body, "visibility");
  const visibility = body.visibility;
  if (hasVisibility && visibility !== "public" && visibility !== "private") {
    throw new BadgeValidationError("Visibility must be public or private.");
  }
  const revoke = body.revoke === true;
  if (!hasVisibility && !revoke) {
    throw new BadgeValidationError("Provide visibility or revoke the badge.");
  }
  if (revoke && visibility === "public") {
    throw new BadgeValidationError("A revoked badge cannot be public.");
  }
  return {
    visibility: hasVisibility ? visibility as TeamBadgeVisibility : undefined,
    revoke,
  };
}

async function loadCloudflareBadge(teamId: string, badgeId: string): Promise<PresentedTeamBadge | null> {
  const row = await privateDb()
    .prepare("SELECT * FROM app_team_badges WHERE id=? AND team_id=? LIMIT 1")
    .bind(badgeId, teamId)
    .first<Record<string, unknown>>();
  if (!row) return null;
  const state = await getWorkspaceState(teamId);
  return presentTeamBadge(row, observedVersion(state.watchlist, String(row.extension_id || "")));
}

async function loadSupabaseBadge(teamId: string, badgeId: string): Promise<PresentedTeamBadge | null> {
  const db = serviceDb();
  const [badgeResult, watchResult] = await Promise.all([
    db.from("team_badges").select("*").eq("id", badgeId).eq("team_id", teamId).maybeSingle(),
    db.from("team_watchlist_items").select("extension_id,last_observed_version,baseline_version").eq("team_id", teamId),
  ]);
  if (badgeResult.error) throw badgeResult.error;
  if (watchResult.error) throw watchResult.error;
  const row = badgeResult.data as Record<string, unknown> | null;
  return row
    ? presentTeamBadge(row, observedVersion((watchResult.data || []) as Array<Record<string, unknown>>, String(row.extension_id || "")))
    : null;
}

async function mutateCloudflareBadge(
  teamId: string,
  badgeId: string,
  userId: string,
  input: BadgePatch,
): Promise<PresentedTeamBadge> {
  const db = privateDb();
  const row = await db.prepare("SELECT * FROM app_team_badges WHERE id=? AND team_id=? LIMIT 1").bind(badgeId, teamId).first<Record<string, unknown>>();
  const badge = normalizeTeamBadge(row);
  if (!badge) throw new BadgeNotFoundError();
  if (badge.status === "revoked") {
    if (input.revoke) return presentTeamBadge(badge) as PresentedTeamBadge;
    throw new BadgeConflictError("A revoked badge cannot be published or changed.");
  }
  const status = input.revoke ? transitionTeamBadgeStatus(badge.status, "revoked") : badge.status;
  const visibility = input.revoke ? "private" : input.visibility || badge.visibility;
  const changed = status !== badge.status || visibility !== badge.visibility;
  if (!changed) return presentTeamBadge(badge) as PresentedTeamBadge;
  const updatedAt = nowIso();
  const revokedAt = input.revoke ? updatedAt : null;
  await db.prepare("UPDATE app_team_badges SET visibility=?,status=?,revoked_at=?,updated_at=? WHERE id=? AND team_id=?")
    .bind(visibility, status, revokedAt, updatedAt, badgeId, teamId)
    .run();
  const state = await getWorkspaceState(teamId);
  const updated = { ...badge, visibility, status, updated_at: updatedAt };
  await audit(teamId, state, userId, auditAction(badge.visibility, visibility, input.revoke), "badge", badge.id, {
    extension_id: badge.extension_id,
    version: badge.version,
    visibility,
    status,
  });
  return presentTeamBadge(updated, observedVersion(state.watchlist, badge.extension_id)) as PresentedTeamBadge;
}

async function mutateSupabaseBadge(
  teamId: string,
  badgeId: string,
  userId: string,
  input: BadgePatch,
): Promise<PresentedTeamBadge> {
  const db = serviceDb();
  const result = await db.from("team_badges").select("*").eq("id", badgeId).eq("team_id", teamId).maybeSingle();
  if (result.error) throw result.error;
  const badge = normalizeTeamBadge(result.data);
  if (!badge) throw new BadgeNotFoundError();
  if (badge.status === "revoked") {
    if (input.revoke) return presentTeamBadge(badge) as PresentedTeamBadge;
    throw new BadgeConflictError("A revoked badge cannot be published or changed.");
  }
  const status = input.revoke ? transitionTeamBadgeStatus(badge.status, "revoked") : badge.status;
  const visibility = input.revoke ? "private" : input.visibility || badge.visibility;
  const changed = status !== badge.status || visibility !== badge.visibility;
  if (!changed) return presentTeamBadge(badge) as PresentedTeamBadge;
  const updatedAt = nowIso();
  const revokedAt = input.revoke ? updatedAt : null;
  const updated = await db.from("team_badges")
    .update({ visibility, status, revoked_at: revokedAt, updated_at: updatedAt })
    .eq("id", badgeId)
    .eq("team_id", teamId)
    .select("*")
    .single();
  if (updated.error) throw updated.error;
  const saved = normalizeTeamBadge(updated.data) || { ...badge, visibility, status, updated_at: updatedAt };
  await recordSupabaseBadgeAudit(db, teamId, userId, saved, auditAction(badge.visibility, visibility, input.revoke));
  return presentTeamBadge(saved) as PresentedTeamBadge;
}

async function recordSupabaseBadgeAudit(
  db: ReturnType<typeof serviceDb>,
  teamId: string,
  userId: string,
  badge: TeamBadge,
  action: string,
): Promise<void> {
  const result = await db.from("team_audit_events").insert({
    team_id: teamId,
    actor_id: userId,
    action,
    object_type: "badge",
    object_id: badge.id,
    extension_id: badge.extension_id,
    version: badge.version,
    resulting_state: { status: badge.status, visibility: badge.visibility },
  });
  if (result.error) throw result.error;
}

function observedVersion(rows: Array<Record<string, unknown>>, extensionId: string): string | null {
  const target = extensionId.toLowerCase();
  const row = rows.find((item) => String(item.extension_id || "").toLowerCase() === target);
  const version = String(row?.last_observed_version || row?.baseline_version || "").trim();
  return version || null;
}

function auditAction(previous: TeamBadgeVisibility, next: TeamBadgeVisibility, revoke: boolean): string {
  if (revoke) return "team_badge_revoked";
  return next === "public" && previous !== "public"
    ? "team_badge_published"
    : "team_badge_unpublished";
}

function notFound() {
  return NextResponse.json({ error: "Team badge not found." }, { status: 404 });
}

class BadgeValidationError extends Error {}
class BadgeConflictError extends Error {}
class BadgeNotFoundError extends Error {}
