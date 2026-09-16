import { randomUUID } from "node:crypto";

type JsonObject = Record<string, unknown>;
type CatalogEntry = { id?: unknown; latest_version?: unknown };

/**
 * Reconcile Cloudflare workspace watches with the catalog mirror.
 *
 * The Supabase catalog refresh already emits release events in SQL. D1 stores
 * private workspace state as a JSON document, so the scheduled Worker needs a
 * small equivalent bridge. It only advances last_observed_version and appends
 * a release queue item; it never rewrites a badge or its historical report.
 */
export async function reconcileCloudflareBadgeHealth(
  db: D1Database,
  now = new Date().toISOString(),
): Promise<{ teams_checked: number; teams_changed: number; releases_detected: number }> {
  const catalogResult = await db
    .prepare("SELECT payload FROM registry_section_chunks WHERE section=? ORDER BY chunk_index")
    .bind("catalog")
    .all<{ payload: string }>();
  const latestByExtension = latestCatalogVersions(catalogResult.results.map((row) => row.payload).join(""));
  if (!latestByExtension.size) return { teams_checked: 0, teams_changed: 0, releases_detected: 0 };

  const teams = await db
    .prepare("SELECT team_id,state_json FROM app_team_state")
    .bind()
    .all<{ team_id: string; state_json: string }>();
  let teamsChanged = 0;
  let releasesDetected = 0;

  for (const team of teams.results) {
    const state = parseState(team.state_json);
    const watchlist = array(state.watchlist);
    if (!watchlist.length) continue;
    const releaseEvents = array(state.release_events);
    const audit = array(state.audit);
    const alerts = array(state.alerts);
    let changed = false;

    for (const watch of watchlist) {
      const extensionId = stringValue(watch.extension_id);
      const latestVersion = latestByExtension.get(extensionId.toLowerCase());
      const observedVersion = stringValue(watch.last_observed_version || watch.baseline_version);
      if (!extensionId || !latestVersion || !observedVersion || latestVersion === observedVersion) continue;

      watch.last_observed_version = latestVersion;
      watch.last_event_at = now;
      changed = true;

      const badgeRows = await db
        .prepare("SELECT id,extension_id,version,status FROM app_team_badges WHERE team_id=? AND extension_id=? AND status IN ('ready','stale')")
        .bind(team.team_id, extensionId)
        .all<Record<string, unknown>>();
      for (const badge of badgeRows.results) {
        if (String(badge.status) !== "ready" || String(badge.version) === latestVersion) continue;
        await db
          .prepare("UPDATE app_team_badges SET status='stale',updated_at=? WHERE id=? AND team_id=? AND status='ready'")
          .bind(now, String(badge.id), team.team_id)
          .run();
      }

      const alreadyQueued = releaseEvents.some((event) =>
        stringValue(event.extension_id).toLowerCase() === extensionId.toLowerCase()
        && stringValue(event.target_version) === latestVersion
        && stringValue(event.state) !== "superseded",
      );
      if (alreadyQueued) continue;

      releaseEvents.unshift({
        id: randomUUID(),
        team_id: team.team_id,
        extension_id: extensionId,
        baseline_version: stringOrNull(watch.baseline_version),
        target_version: latestVersion,
        state: "release_detected",
        materiality: "analysis_unavailable",
        error: null,
        created_at: now,
        updated_at: now,
      });
      audit.unshift({
        event_id: randomUUID(),
        workspace_id: team.team_id,
        actor_id: null,
        action: "team_release_detected",
        object_type: "badge",
        object_id: `release:${extensionId}@${latestVersion}`,
        extension_id: extensionId,
        version: latestVersion,
        previous_state: { last_observed_version: observedVersion },
        resulting_state: { last_observed_version: latestVersion },
        rationale: null,
        risk_level: null,
        receipt_id: randomUUID(),
        occurred_at: now,
      });
      const alertId = randomUUID();
      const alert = {
        id: alertId,
        team_id: team.team_id,
        extension_id: extensionId,
        version: latestVersion,
        kind: "release_detected",
        severity: "INFORMATIONAL",
        state: "unread",
        title: `New release detected: ${extensionId}@${latestVersion}`,
        summary: "A watched release changed. Refresh the exact badge after reviewing its new report.",
        metadata: { release_event: true, baseline_version: observedVersion, badge_refresh_recommended: true },
        dedupe_key: `release:${extensionId}@${latestVersion}`,
        created_at: now,
      };
      const preferences = jsonObject(state.preferences);
      if (preferences.release_alerts !== false) {
        const existingAlert = alerts.some((item) => String(item.dedupe_key) === alert.dedupe_key);
        if (!existingAlert) alerts.unshift(alert);
        for (const channel of array(state.channels)) {
          if (channel.enabled === false || !stringValue(channel.target)) continue;
          const payload = {
            provider: String(channel.kind || "generic_webhook"),
            event: "guardrails.badge_refresh_recommended",
            team_id: team.team_id,
            extension_id: extensionId,
            baseline_version: observedVersion,
            target_version: latestVersion,
            message: alert.summary,
            badge_refresh_recommended: true,
          };
          const deliveryKey = `badge-release:${team.team_id}:${extensionId}:${latestVersion}:${String(channel.id)}`;
          const existingDelivery = await db.prepare("SELECT id FROM app_notification_deliveries WHERE team_id=? AND (delivery_key=? OR payload_json LIKE ?) LIMIT 1")
            .bind(team.team_id, deliveryKey, `%${deliveryKey}%`).first<Record<string, unknown>>();
          if (!existingDelivery) {
            await db.prepare("INSERT OR IGNORE INTO app_notification_deliveries(id,team_id,kind,target,payload_json,status,attempts,next_attempt_at,created_at,delivery_key) VALUES(?,?,?,?,?,?,?,?,?,?)")
              .bind(randomUUID(), team.team_id, String(channel.kind || "generic_webhook"), String(channel.target), JSON.stringify({ ...payload, delivery_key: deliveryKey }), "pending", 0, now, now, deliveryKey).run();
          }
        }
      }
      releasesDetected += 1;
    }

    if (!changed) continue;
    teamsChanged += 1;
    state.watchlist = watchlist;
    state.release_events = releaseEvents.slice(0, 200);
    state.alerts = alerts.slice(0, 200);
    state.audit = audit.slice(0, 500);
    await db
      .prepare("UPDATE app_team_state SET state_json=?,updated_at=? WHERE team_id=?")
      .bind(JSON.stringify(state), now, team.team_id)
      .run();
  }

  return { teams_checked: teams.results.length, teams_changed: teamsChanged, releases_detected: releasesDetected };
}

function latestCatalogVersions(payload: string): Map<string, string> {
  if (!payload) return new Map();
  try {
    const parsed = JSON.parse(payload) as unknown;
    const entries = Array.isArray(parsed)
      ? parsed
      : parsed && typeof parsed === "object" && Array.isArray((parsed as JsonObject).catalog)
        ? (parsed as JsonObject).catalog
        : [];
    return new Map(
      (entries as CatalogEntry[])
        .map((entry) => [stringValue(entry.id).toLowerCase(), stringValue(entry.latest_version)] as const)
        .filter(([extensionId, version]) => Boolean(extensionId && version)),
    );
  } catch {
    return new Map();
  }
}

function parseState(value: string): JsonObject {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as JsonObject
      : {};
  } catch {
    return {};
  }
}

function jsonObject(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonObject
    : {};
}

function array(value: unknown): JsonObject[] {
  return Array.isArray(value)
    ? value.filter((item): item is JsonObject => Boolean(item && typeof item === "object" && !Array.isArray(item)))
    : [];
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function stringOrNull(value: unknown): string | null {
  const result = stringValue(value);
  return result || null;
}
