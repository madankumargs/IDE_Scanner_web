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
    let changed = false;

    for (const watch of watchlist) {
      const extensionId = stringValue(watch.extension_id);
      const latestVersion = latestByExtension.get(extensionId.toLowerCase());
      const observedVersion = stringValue(watch.last_observed_version || watch.baseline_version);
      if (!extensionId || !latestVersion || !observedVersion || latestVersion === observedVersion) continue;

      watch.last_observed_version = latestVersion;
      watch.last_event_at = now;
      changed = true;

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
      releasesDetected += 1;
    }

    if (!changed) continue;
    teamsChanged += 1;
    state.watchlist = watchlist;
    state.release_events = releaseEvents.slice(0, 200);
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
