import { NextResponse } from "next/server";
import { authenticated } from "@/lib/auth";
import { queueDeepScan } from "@/lib/deepScan";
import { getCloudflareScanProduct } from "@/lib/cloudflareDeepScan";
import { audit, getWorkspaceState } from "@/lib/cloudflareWorkspace";
import { newId, nowIso, privateDb } from "@/lib/cloudflarePrivate";
import { serviceDb } from "@/lib/supabase";
import { requireTeamRole } from "@/lib/teams";
import { teamApiError } from "@/lib/teamApiError";
import {
  badgeKey,
  normalizeTeamBadge,
  teamBadgeFromScan,
  type TeamBadge,
  type TeamBadgeVisibility,
} from "@/lib/teamBadges";
import { presentTeamBadge, type PresentedTeamBadge } from "@/lib/teamBadgePresentation";
import { badgeInsight } from "@/lib/teamBadgeInsights";
import { TEAM_BADGE_LIMITS, badgeLimitMessage } from "@/lib/teamBadgeLimits";

export const dynamic = "force-dynamic";

type Context = { params: Promise<{ id: string }> };
type BadgeResponse = PresentedTeamBadge;

const extensionPattern = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_.-]+$/;

export async function GET(request: Request, context: Context) {
  try {
    const { user, provider } = await authenticated(request);
    const { id } = await context.params;
    await requireTeamRole(id, user.id, ["owner", "admin", "analyst", "viewer"]);
    const badges = provider === "cloudflare"
      ? await listCloudflareBadges(id, user.id)
      : await listSupabaseBadges(id, user.id);
    return NextResponse.json({
      badges,
      summary: summarizeBadges(badges),
    });
  } catch (error) {
    const failure = teamApiError(error, "Team badges are temporarily unavailable.");
    return NextResponse.json({ error: failure.error }, { status: failure.status });
  }
}

export async function POST(request: Request, context: Context) {
  try {
    const { user, provider } = await authenticated(request);
    const { id } = await context.params;
    await requireTeamRole(id, user.id, ["owner", "admin", "analyst"]);
    const input = await parseInput(request);
    const result = provider === "cloudflare"
      ? await createCloudflareBadge(id, user.id, input, request)
      : await createSupabaseBadge(id, user.id, input, request);
    return NextResponse.json(result.body, { status: result.status });
  } catch (error) {
    if (error instanceof RequestValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof BadgeConflictError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    const failure = teamApiError(error, "The team badge could not be created.");
    return NextResponse.json({ error: failure.error }, { status: failure.status });
  }
}

type BadgeInput = {
  extensionId: string;
  version: string;
  force: boolean;
};

async function parseInput(request: Request): Promise<BadgeInput> {
  const body = await request.json().catch(() => ({}));
  const extensionId = typeof body.extension_id === "string" ? body.extension_id.trim() : "";
  const version = typeof body.version === "string" ? body.version.trim().replace(/^v/, "") : "";
  if (!extensionPattern.test(extensionId)) {
    throw new RequestValidationError("A valid extension id is required.");
  }
  if (!version || version.length > 120 || /[\u0000-\u001f\u007f]/.test(version)) {
    throw new RequestValidationError("An exact extension version is required.");
  }
  return { extensionId, version, force: body.force === true };
}

async function listCloudflareBadges(teamId: string, userId: string): Promise<BadgeResponse[]> {
  const db = privateDb();
  const rows = await db
    .prepare("SELECT * FROM app_team_badges WHERE team_id=? ORDER BY updated_at DESC")
    .bind(teamId)
    .all<Record<string, unknown>>();
  const state = await getWorkspaceState(teamId);
  const observed = observedVersions(state.watchlist);
  const reconciled: Record<string, unknown>[] = [];
  for (const row of rows.results) {
    reconciled.push(await reconcileCloudflareBadge(db, teamId, userId, row, state));
  }
  return addInsights(reconciled
    .map((row) => presentTeamBadge(row, observed.get(String(row.extension_id).toLowerCase())))
    .filter((badge): badge is BadgeResponse => Boolean(badge)));
}

async function listSupabaseBadges(teamId: string, userId: string): Promise<BadgeResponse[]> {
  const db = serviceDb();
  const [badgeResult, watchResult] = await Promise.all([
    db.from("team_badges").select("*").eq("team_id", teamId).order("updated_at", { ascending: false }),
    db.from("team_watchlist_items").select("extension_id,last_observed_version").eq("team_id", teamId),
  ]);
  if (badgeResult.error) throw badgeResult.error;
  if (watchResult.error) throw watchResult.error;
  const observed = observedVersions((watchResult.data || []) as Array<Record<string, unknown>>);
  const reconciled = await reconcileSupabaseBadges(
    db,
    teamId,
    userId,
    (badgeResult.data || []) as Array<Record<string, unknown>>,
  );
  return addInsights(reconciled
    .map((row) => presentTeamBadge(row, observed.get(String(row.extension_id).toLowerCase())))
    .filter((badge): badge is BadgeResponse => Boolean(badge)));
}

/**
 * A scan callback owns the immutable report, not the team badge row. Reconcile
 * the small projection on reads so a user who leaves Badge Studio while a scan
 * runs still sees a terminal badge when they return. This is intentionally
 * idempotent and only advances pending rows.
 */
async function reconcileCloudflareBadge(
  db: ReturnType<typeof privateDb>,
  teamId: string,
  userId: string,
  row: Record<string, unknown>,
  state: Awaited<ReturnType<typeof getWorkspaceState>>,
): Promise<Record<string, unknown>> {
  const badge = normalizeTeamBadge(row);
  const jobId = badge?.scan_job_id;
  if (!badge || badge.status !== "pending" || !jobId) return row;

  const job = await db
    .prepare("SELECT id,status,error FROM app_scan_jobs WHERE id=? LIMIT 1")
    .bind(jobId)
    .first<Record<string, unknown>>();
  const jobStatus = String(job?.status || "");
  if (jobStatus === "complete") {
    const report = await db
      .prepare("SELECT scan_id FROM app_scan_reports WHERE job_id=? LIMIT 1")
      .bind(jobId)
      .first<Record<string, unknown>>();
    const scanId = stringOrNull(report?.scan_id);
    if (!scanId) return row;
    const summary = await getCloudflareCompletedScan(badge.extension_id, badge.version, scanId);
    if (!summary) return row;
    if (String(summary.analysis_status || "") !== "complete") {
      const updated = failedBadge(badge, summaryError(summary), nowIso());
      await writeCloudflareBadge(teamId, updated, true);
      await audit(teamId, state, userId, "team_badge_scan_failed", "badge", badge.id, {
        extension_id: badge.extension_id,
        version: badge.version,
        status: updated.status,
        error: updated.last_error,
      });
      return updated;
    }
    const updated = teamBadgeFromScan(summary, {
      ...badge,
      updated_at: nowIso(),
      scan_job_id: jobId,
    });
    await writeCloudflareBadge(teamId, updated, true);
    await audit(teamId, state, userId, "team_badge_ready", "badge", badge.id, {
      extension_id: badge.extension_id,
      version: badge.version,
      status: updated.status,
      scan_id: updated.scan_id,
    });
    return updated;
  }

  if (!job || jobStatus === "failed" || jobStatus === "incomplete") {
    const updated = failedBadge(
      badge,
      stringOrNull(job?.error) || "The scan did not produce a complete report.",
      nowIso(),
    );
    await writeCloudflareBadge(teamId, updated, true);
    await audit(teamId, state, userId, "team_badge_scan_failed", "badge", badge.id, {
      extension_id: badge.extension_id,
      version: badge.version,
      status: updated.status,
      error: updated.last_error,
    });
    return updated;
  }

  return row;
}

async function reconcileSupabaseBadges(
  db: ReturnType<typeof serviceDb>,
  teamId: string,
  userId: string,
  rows: Array<Record<string, unknown>>,
): Promise<Array<Record<string, unknown>>> {
  const pending = rows
    .map((row) => ({ row, badge: normalizeTeamBadge(row) }))
    .filter((item): item is { row: Record<string, unknown>; badge: TeamBadge } => Boolean(item.badge?.status === "pending" && item.badge.scan_job_id));
  if (!pending.length) return rows;

  const jobIds = pending.map(({ badge }) => badge.scan_job_id as string);
  const jobsResult = await db.from("scan_jobs").select("id,status,error").in("id", jobIds);
  if (jobsResult.error) throw jobsResult.error;
  const jobs = new Map((jobsResult.data || []).map((job) => [String(job.id), job as Record<string, unknown>]));
  const completeJobIds = [...jobs.values()]
    .filter((job) => String(job.status) === "complete")
    .map((job) => String(job.id));
  const scans = new Map<string, Record<string, unknown>>();
  if (completeJobIds.length) {
    const scansResult = await db
      .from("scans")
      .select("id,job_id,extension_id,version,artifact_sha256,analysis_status,decision,verdict,public_outcome,analysis_coverage,capability_assessment,risk_score,malware_score,coverage_percent,scanned_at")
      .in("job_id", completeJobIds);
    if (scansResult.error) throw scansResult.error;
    for (const scan of scansResult.data || []) scans.set(String(scan.job_id), scan as Record<string, unknown>);
  }

  const result: Array<Record<string, unknown>> = [];
  for (const row of rows) {
    const badge = normalizeTeamBadge(row);
    if (!badge || badge.status !== "pending" || !badge.scan_job_id) {
      result.push(row);
      continue;
    }
    const job = jobs.get(badge.scan_job_id);
    const jobStatus = String(job?.status || "");
    const scan = scans.get(badge.scan_job_id);
    if (jobStatus === "complete" && scan && String(scan.analysis_status) === "complete") {
      const updated = teamBadgeFromScan(scan, { ...badge, updated_at: nowIso(), scan_job_id: badge.scan_job_id });
      const saved = await db
        .from("team_badges")
        .update(serializeSupabaseBadge(updated))
        .eq("id", badge.id)
        .eq("team_id", teamId)
        .select("*")
        .single();
      if (saved.error) throw saved.error;
      const normalized = normalizeTeamBadge(saved.data) || updated;
      await recordSupabaseBadgeAudit(db, teamId, userId, normalized, "team_badge_ready");
      result.push(serializeSupabaseBadge(normalized));
      continue;
    }
    if (!job || jobStatus === "failed" || jobStatus === "incomplete" || (jobStatus === "complete" && scan)) {
      const updated = failedBadge(
        badge,
        stringOrNull(job?.error) || (jobStatus === "complete" && scan
          ? "The scan report was incomplete and cannot back a shareable badge."
          : "The scan did not produce a complete report."),
        nowIso(),
      );
      const saved = await db
        .from("team_badges")
        .update(serializeSupabaseBadge(updated))
        .eq("id", badge.id)
        .eq("team_id", teamId)
        .select("*")
        .single();
      if (saved.error) throw saved.error;
      const normalized = normalizeTeamBadge(saved.data) || updated;
      await recordSupabaseBadgeAudit(db, teamId, userId, normalized, "team_badge_scan_failed");
      result.push(serializeSupabaseBadge(normalized));
      continue;
    }
    result.push(row);
  }
  return result;
}

async function createCloudflareBadge(
  teamId: string,
  userId: string,
  input: BadgeInput,
  request: Request,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const db = privateDb();
  const key = badgeKey(input.extensionId, input.version);
  const existingRow = await db
    .prepare("SELECT * FROM app_team_badges WHERE team_id=? AND badge_key=? LIMIT 1")
    .bind(teamId, key)
    .first<Record<string, unknown>>();
  const existing = normalizeTeamBadge(existingRow);
  if (existing?.status === "revoked") {
    throw new BadgeConflictError("This exact release badge was revoked and cannot be reactivated.");
  }
  if (existing && (!input.force || existing.status === "ready")) {
    if (input.force && existing.status === "ready") {
      return {
        status: 409,
        body: { error: "This exact release already has a ready badge." },
      };
    }
    return { status: 200, body: await syncCloudflarePending(teamId, userId, input, existing, request) };
  }

  const counts = await Promise.all([
    db.prepare("SELECT COUNT(*) AS count FROM app_team_badges WHERE team_id=? AND status <> 'revoked'").bind(teamId).first<Record<string, unknown>>(),
    db.prepare("SELECT COUNT(*) AS count FROM app_team_badges WHERE team_id=? AND status='pending'").bind(teamId).first<Record<string, unknown>>(),
  ]);
  if (Number(counts[0]?.count || 0) >= TEAM_BADGE_LIMITS.max_published_records) throw new Error(`BADGE_LIMIT: ${badgeLimitMessage("max_published_records")}`);
  if (Number(counts[1]?.count || 0) >= TEAM_BADGE_LIMITS.max_active_scans) throw new Error(`BADGE_LIMIT: ${badgeLimitMessage("max_active_scans")}`);

  const scan = await queueDeepScan(
    input.extensionId,
    input.version,
    request,
    userId,
    input.force,
    "team_badge",
  );
  const now = nowIso();
  const badgeId = existing?.id || newId();
  const token = existing?.public_token || publicToken();
  const scanId = stringOrNull(scan.scan_id);
  const summary = scan.status === "complete" && scanId
    ? await getCloudflareCompletedScan(String(scan.extension_id || input.extensionId), input.version, scanId)
    : null;
  const badge = summary
    ? teamBadgeFromScan(summary, {
        id: badgeId,
        team_id: teamId,
        created_by: existing?.created_by || userId,
        created_at: existing?.created_at || now,
        updated_at: now,
        public_token: token,
        visibility: existing?.visibility || "public",
        display_name: existing?.display_name || input.extensionId,
        scan_job_id: stringOrNull(scan.id),
      })
    : pendingBadge({
        id: badgeId,
        team_id: teamId,
        extension_id: input.extensionId,
        version: input.version,
        created_by: existing?.created_by || userId,
        created_at: existing?.created_at || now,
        updated_at: now,
        scan_job_id: stringOrNull(scan.id),
        public_token: token,
        display_name: existing?.display_name || input.extensionId,
        visibility: existing?.visibility || "public",
        last_error: null,
      });
  try {
    await writeCloudflareBadge(teamId, badge, existing !== null);
  } catch (error) {
    if (!existing && isUniqueConstraintError(error)) {
      const winner = normalizeTeamBadge(await db
        .prepare("SELECT * FROM app_team_badges WHERE team_id=? AND badge_key=? LIMIT 1")
        .bind(teamId, key)
        .first<Record<string, unknown>>());
      if (winner) {
        const state = await getWorkspaceState(teamId);
        return {
          status: winner.status === "ready" ? 201 : 202,
          body: {
            badge: presentTeamBadge(winner, observedFromState(state, winner.extension_id)),
            reused_scan: true,
          },
        };
      }
    }
    throw error;
  }
  const state = await getWorkspaceState(teamId);
  await audit(teamId, state, userId, existing ? "team_badge_refresh_requested" : "team_badge_created", "badge", badge.id, {
    extension_id: badge.extension_id,
    version: badge.version,
    status: badge.status,
  });
  return {
    status: badge.status === "ready" ? 201 : 202,
    body: { badge: presentTeamBadge(badge, observedFromState(state, badge.extension_id)), reused_scan: scan.reused === true || scan.deduplicated === true },
  };
}

async function syncCloudflarePending(
  teamId: string,
  userId: string,
  input: BadgeInput,
  existing: TeamBadge,
  request: Request,
): Promise<Record<string, unknown>> {
  if (existing.status !== "pending") {
    return { badge: presentTeamBadge(existing, observedFromState(await getWorkspaceState(teamId), existing.extension_id)) };
  }
  const scan = await queueDeepScan(
    input.extensionId,
    input.version,
    request,
    userId,
    false,
    "team_badge",
  );
  const now = nowIso();
  const scanId = stringOrNull(scan.scan_id);
  const summary = scan.status === "complete" && scanId
    ? await getCloudflareCompletedScan(String(scan.extension_id || input.extensionId), input.version, scanId)
    : null;
  const badge = summary
    ? teamBadgeFromScan(summary, { ...existing, updated_at: now, scan_job_id: stringOrNull(scan.id) || existing.scan_job_id })
    : { ...existing, scan_job_id: stringOrNull(scan.id) || existing.scan_job_id, updated_at: now };
  await writeCloudflareBadge(teamId, badge, true);
  const state = await getWorkspaceState(teamId);
  return {
    badge: presentTeamBadge(badge, observedFromState(state, badge.extension_id)),
    reused_scan: scan.reused === true || scan.deduplicated === true,
  };
}

async function writeCloudflareBadge(teamId: string, badge: TeamBadge, update: boolean): Promise<void> {
  const db = privateDb();
  const values = [
    badge.id,
    teamId,
    badge.extension_id,
    badgeKey(badge.extension_id, badge.version),
    badge.display_name,
    badge.mode,
    badge.version,
    badge.scan_id,
    badge.scan_job_id,
    badge.artifact_sha256,
    badge.public_token,
    badge.visibility,
    badge.status,
    badge.decision,
    badge.verdict,
    badge.public_outcome,
    badge.trust_tier,
    badge.trust_label,
    badge.coverage_percent,
    badge.risk_score,
    badge.malware_score,
    badge.capability_assessment ? JSON.stringify(badge.capability_assessment) : null,
    badge.scanned_at,
    badge.last_error,
    badge.created_by,
    badge.created_at,
    badge.updated_at,
  ];
  if (update) {
    await db.prepare(`UPDATE app_team_badges SET display_name=?,scan_id=?,scan_job_id=?,artifact_sha256=?,status=?,decision=?,verdict=?,public_outcome=?,trust_tier=?,trust_label=?,coverage_percent=?,risk_score=?,malware_score=?,capability_assessment=?,scanned_at=?,last_error=?,updated_at=? WHERE id=? AND team_id=?`).bind(
      badge.display_name, badge.scan_id, badge.scan_job_id, badge.artifact_sha256, badge.status, badge.decision, badge.verdict, badge.public_outcome, badge.trust_tier, badge.trust_label, badge.coverage_percent, badge.risk_score, badge.malware_score, badge.capability_assessment ? JSON.stringify(badge.capability_assessment) : null, badge.scanned_at, badge.last_error, badge.updated_at, badge.id, teamId,
    ).run();
    return;
  }
  await db.prepare(`INSERT INTO app_team_badges(id,team_id,extension_id,badge_key,display_name,mode,version,scan_id,scan_job_id,artifact_sha256,public_token,visibility,status,decision,verdict,public_outcome,trust_tier,trust_label,coverage_percent,risk_score,malware_score,capability_assessment,scanned_at,last_error,created_by,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(...values).run();
}

async function createSupabaseBadge(
  teamId: string,
  userId: string,
  input: BadgeInput,
  request: Request,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const db = serviceDb();
  const key = badgeKey(input.extensionId, input.version);
  const existingResult = await db.from("team_badges").select("*").eq("team_id", teamId).eq("badge_key", key).maybeSingle();
  if (existingResult.error) throw existingResult.error;
  const existing = normalizeTeamBadge(existingResult.data);
  if (existing?.status === "revoked") {
    throw new BadgeConflictError("This exact release badge was revoked and cannot be reactivated.");
  }
  if (existing && (!input.force || existing.status === "ready")) {
    if (input.force && existing.status === "ready") return { status: 409, body: { error: "This exact release already has a ready badge." } };
    return { status: 200, body: await syncSupabasePending(teamId, userId, input, existing, request) };
  }
  await enforceSupabaseBadgeLimits(db, teamId);
  const scan = await queueDeepScan(input.extensionId, input.version, request, userId, input.force, "team_badge");
  const now = nowIso();
  const token = existing?.public_token || publicToken();
  const scanId = stringOrNull(scan.scan_id);
  const summary = scan.status === "complete" && scanId
    ? await getSupabaseCompletedScan(String(scan.extension_id || input.extensionId), input.version, scanId)
    : null;
  const badge = summary
    ? teamBadgeFromScan(summary, {
        id: existing?.id || newId(),
        team_id: teamId,
        created_by: existing?.created_by || userId,
        created_at: existing?.created_at || now,
        updated_at: now,
        public_token: token,
        visibility: existing?.visibility || "public",
        display_name: existing?.display_name || input.extensionId,
        scan_job_id: stringOrNull(scan.id),
      })
    : pendingBadge({
        id: existing?.id || newId(),
        team_id: teamId,
        extension_id: input.extensionId,
        version: input.version,
        created_by: existing?.created_by || userId,
        created_at: existing?.created_at || now,
        updated_at: now,
        scan_job_id: stringOrNull(scan.id),
        public_token: token,
        display_name: existing?.display_name || input.extensionId,
        visibility: existing?.visibility || "public",
        last_error: null,
      });
  const row = serializeSupabaseBadge(badge);
  const result = existing
    ? await db.from("team_badges").update(row).eq("id", existing.id).eq("team_id", teamId).select("*").single()
    : await db.from("team_badges").insert(row).select("*").single();
  if (result.error && !existing && isUniqueConstraintError(result.error)) {
    const winner = await db.from("team_badges").select("*").eq("team_id", teamId).eq("badge_key", key).maybeSingle();
    if (winner.error) throw winner.error;
    if (winner.data) {
      const normalized = normalizeTeamBadge(winner.data);
      if (normalized) {
        return {
          status: normalized.status === "ready" ? 201 : 202,
          body: { badge: presentTeamBadge(normalized), reused_scan: true },
        };
      }
    }
  }
  if (result.error) throw result.error;
  await recordSupabaseBadgeAudit(db, teamId, userId, badge, existing ? "team_badge_refresh_requested" : "team_badge_created");
  const saved = normalizeTeamBadge(result.data) || badge;
  return {
    status: saved.status === "ready" ? 201 : 202,
    body: { badge: presentTeamBadge(saved), reused_scan: scan.reused === true || scan.deduplicated === true },
  };
}

async function syncSupabasePending(
  teamId: string,
  userId: string,
  input: BadgeInput,
  existing: TeamBadge,
  request: Request,
): Promise<Record<string, unknown>> {
  if (existing.status !== "pending") return { badge: presentTeamBadge(existing) };
  const scan = await queueDeepScan(input.extensionId, input.version, request, userId, false, "team_badge");
  const scanId = stringOrNull(scan.scan_id);
  const summary = scan.status === "complete" && scanId
    ? await getSupabaseCompletedScan(input.extensionId, input.version, scanId)
    : null;
  const now = nowIso();
  const badge = summary
    ? teamBadgeFromScan(summary, { ...existing, updated_at: now, scan_job_id: stringOrNull(scan.id) || existing.scan_job_id })
    : { ...existing, scan_job_id: stringOrNull(scan.id) || existing.scan_job_id, updated_at: now };
  const result = await serviceDb().from("team_badges").update(serializeSupabaseBadge(badge)).eq("id", badge.id).eq("team_id", teamId).select("*").single();
  if (result.error) throw result.error;
  const saved = normalizeTeamBadge(result.data) || badge;
  return { badge: presentTeamBadge(saved), reused_scan: scan.reused === true || scan.deduplicated === true };
}

async function getCloudflareCompletedScan(extensionId: string, version: string, scanId: string): Promise<Record<string, unknown> | null> {
  const product = await getCloudflareScanProduct(extensionId, version, scanId);
  return product?.scan && typeof product.scan === "object" ? product.scan as Record<string, unknown> : null;
}

async function getSupabaseCompletedScan(extensionId: string, version: string, scanId: string): Promise<Record<string, unknown> | null> {
  const result = await serviceDb().from("scans").select("id,extension_id,version,artifact_sha256,analysis_status,decision,verdict,public_outcome,analysis_coverage,capability_assessment,risk_score,malware_score,coverage_percent,scanned_at").eq("id", scanId).eq("extension_id", extensionId).eq("version", version).maybeSingle();
  if (result.error) throw result.error;
  return result.data as Record<string, unknown> | null;
}

async function recordSupabaseBadgeAudit(db: ReturnType<typeof serviceDb>, teamId: string, userId: string, badge: TeamBadge, action: string): Promise<void> {
  const result = await db.from("team_audit_events").insert({
    team_id: teamId,
    actor_id: userId,
    action,
    object_type: "badge",
    object_id: badge.id,
    extension_id: badge.extension_id,
    version: badge.version,
    resulting_state: { status: badge.status, risk_score: badge.risk_score, trust_tier: badge.trust_tier },
  });
  if (result.error) throw result.error;
}

function serializeSupabaseBadge(badge: TeamBadge): Record<string, unknown> {
  return {
    id: badge.id,
    team_id: badge.team_id,
    extension_id: badge.extension_id,
    badge_key: badgeKey(badge.extension_id, badge.version),
    display_name: badge.display_name,
    mode: badge.mode,
    version: badge.version,
    scan_id: badge.scan_id,
    scan_job_id: badge.scan_job_id,
    artifact_sha256: badge.artifact_sha256,
    public_token: badge.public_token,
    visibility: badge.visibility,
    status: badge.status,
    decision: badge.decision,
    verdict: badge.verdict,
    public_outcome: badge.public_outcome,
    trust_tier: badge.trust_tier,
    trust_label: badge.trust_label,
    coverage_percent: badge.coverage_percent,
    risk_score: badge.risk_score,
    malware_score: badge.malware_score,
    capability_assessment: badge.capability_assessment,
    scanned_at: badge.scanned_at,
    last_error: badge.last_error,
    created_by: badge.created_by,
    created_at: badge.created_at,
    updated_at: badge.updated_at,
  };
}

function pendingBadge(input: {
  id: string;
  team_id: string;
  extension_id: string;
  version: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  scan_job_id: string | null;
  public_token: string;
  display_name: string;
  visibility: TeamBadgeVisibility;
  last_error: string | null;
}): TeamBadge {
  return {
    ...input,
    mode: "exact_release",
    scan_id: null,
    artifact_sha256: null,
    status: "pending",
    decision: null,
    verdict: null,
    public_outcome: null,
    trust_tier: null,
    trust_label: null,
    coverage_percent: null,
    risk_score: null,
    malware_score: null,
    capability_assessment: null,
    scanned_at: null,
  };
}

function observedVersions(rows: Array<Record<string, unknown>>): Map<string, string> {
  const entries: Array<[string, string]> = [];
  for (const row of rows) {
    const extensionId = String(row.extension_id || "").toLowerCase();
    const version = String(row.last_observed_version || row.baseline_version || "").trim();
    if (extensionId && version) entries.push([extensionId, version]);
  }
  return new Map(entries);
}

function observedFromState(state: { watchlist: Array<Record<string, unknown>> }, extensionId: string): string | null {
  return observedVersions(state.watchlist).get(extensionId.toLowerCase()) || null;
}

function summarizeBadges(badges: BadgeResponse[]) {
  return {
    total: badges.length,
    ready: badges.filter((badge) => badge.status === "ready").length,
    stale: badges.filter((badge) => badge.status === "stale").length,
    pending: badges.filter((badge) => badge.status === "pending").length,
    failed: badges.filter((badge) => badge.status === "failed").length,
  };
}

function addInsights(badges: BadgeResponse[]): BadgeResponse[] {
  const grouped = new Map<string, BadgeResponse[]>();
  for (const badge of badges) {
    const key = badge.extension_id.toLowerCase();
    grouped.set(key, [...(grouped.get(key) || []), badge]);
  }
  return badges.map((badge) => {
    const previous = (grouped.get(badge.extension_id.toLowerCase()) || [])
      .filter((candidate) => candidate.version !== badge.version && candidate.scanned_at)
      .sort((a, b) => String(b.scanned_at).localeCompare(String(a.scanned_at)))[0];
    return { ...badge, insight: badgeInsight(badge, previous) };
  });
}

async function enforceSupabaseBadgeLimits(db: ReturnType<typeof serviceDb>, teamId: string): Promise<void> {
  const result = await db.from("team_badges").select("id,status,created_at").eq("team_id", teamId);
  if (result.error) throw result.error;
  const rows = Array.isArray(result.data) ? result.data as Array<Record<string, unknown>> : [];
  const active = rows.filter((row) => String(row.status) === "pending").length;
  const durable = rows.filter((row) => String(row.status) !== "revoked").length;
  if (durable >= TEAM_BADGE_LIMITS.max_published_records) throw new Error(`BADGE_LIMIT: ${badgeLimitMessage("max_published_records")}`);
  if (active >= TEAM_BADGE_LIMITS.max_active_scans) throw new Error(`BADGE_LIMIT: ${badgeLimitMessage("max_active_scans")}`);
}

function publicToken(): string {
  return `tb_${newId().replaceAll("-", "")}`;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function failedBadge(badge: TeamBadge, error: string, updatedAt: string): TeamBadge {
  return {
    ...badge,
    status: "failed",
    last_error: error.slice(0, 1000),
    updated_at: updatedAt,
  };
}

function summaryError(summary: Record<string, unknown>): string {
  return stringOrNull(summary.decision_reason)
    || "The scan report is incomplete and cannot back a shareable badge.";
}

function isUniqueConstraintError(error: unknown): boolean {
  const value = error && typeof error === "object" ? error as Record<string, unknown> : {};
  return String(value.code || "") === "23505" || /unique|constraint/i.test(String(value.message || error || ""));
}

class RequestValidationError extends Error {}
class BadgeConflictError extends Error {}
