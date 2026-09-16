import { randomUUID } from "node:crypto";
import { jsonValue, nowIso, saveWorkspaceState, type PrivateDatabase } from "@/lib/cloudflarePrivate";
import type { CloudflareWorkspaceState } from "@/lib/cloudflareWorkspace";

type Row = Record<string, unknown>;

/** Queue one opt-in, deduplicated weekly summary for Cloudflare-backed teams. */
export async function queueCloudflareTeamDigests(db: PrivateDatabase, now = nowIso()) {
  const teams = await db.prepare("SELECT team_id,state_json FROM app_team_state").all<{ team_id: string; state_json: string }>();
  let queued = 0;
  for (const team of teams.results) {
    const state = stateFrom(team.state_json);
    if (state.preferences.weekly_digest !== true) continue;
    const due = weeklyDue(now, Number(state.preferences.digest_weekday || 1), Number(state.preferences.digest_hour_utc ?? 9));
    if (new Date(now).getTime() < due.getTime()) continue;
    const periodStart = new Date(due.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const periodEnd = due.toISOString();
    const existing = state.digest_deliveries.some((item) => String(item.period_start) === periodStart);
    if (existing) continue;
    const channels = state.channels.filter((channel) => channel.enabled !== false && ["slack_webhook", "generic_webhook", "jira_cloud", "email_resend"].includes(String(channel.kind)) && (String(channel.kind) === "jira_cloud" || String(channel.kind) === "email_resend" || /^https:/.test(String(channel.target || ""))));
    if (!channels.length) continue;
    const releaseEvents = state.release_events.filter((event) => inPeriod(event.created_at, periodStart, periodEnd));
    const alerts = state.alerts.filter((alert) => inPeriod(alert.created_at, periodStart, periodEnd));
    const decisions = state.decisions.filter((decision) => inPeriod(decision.updated_at, periodStart, periodEnd));
    const highlights = [...releaseEvents, ...alerts].slice(0, 5).map((item) => `${String(item.extension_id || "extension")}@${String(item.target_version || item.version || "new release")}: ${String(item.title || item.summary || "release change")}`);
    const dedupeKey = `cloudflare-digest:${team.team_id}:${periodStart}`;
    const summary = {
      event: "guardrails.weekly_digest",
      delivery_key: dedupeKey,
      period_start: periodStart,
      period_end: periodEnd,
      monitored_extensions: state.watchlist.length,
      release_changes: releaseEvents.length,
      needs_review: alerts.length + state.decisions.filter((item) => !item.resolved_at).length,
      decisions_recorded: decisions.length,
      highlights,
    };
    let queuedForTeam = 0;
    for (const channel of channels) {
      const target = String(channel.target);
      const deliveryKey = `${dedupeKey}:${String(channel.id || channel.kind)}`;
      const existingDelivery = await db.prepare("SELECT id FROM app_notification_deliveries WHERE team_id=? AND (delivery_key=? OR payload_json LIKE ?) LIMIT 1")
        .bind(team.team_id, deliveryKey, `%${deliveryKey}%`).first<Row>();
      if (existingDelivery) continue;
      await db.prepare("INSERT OR IGNORE INTO app_notification_deliveries(id,team_id,kind,target,payload_json,status,attempts,next_attempt_at,created_at,delivery_key) VALUES(?,?,?,?,?,?,?,?,?,?)")
        .bind(randomUUID(), team.team_id, String(channel.kind), target, JSON.stringify({ ...(channel.kind === "slack_webhook" ? slackPayload(summary) : summary), provider: String(channel.kind), delivery_key: deliveryKey }), "pending", 0, now, now, deliveryKey).run();
      queuedForTeam += 1;
    }
    state.digest_deliveries.unshift({ id: randomUUID(), period_start: periodStart, period_end: periodEnd, status: "pending", channel_count: channels.length, created_at: now });
    state.digest_deliveries = state.digest_deliveries.slice(0, 25);
    await saveWorkspaceState(team.team_id, state as unknown as Record<string, unknown>);
    queued += queuedForTeam;
  }
  return { teams_checked: teams.results.length, queued };
}

function stateFrom(value: string): CloudflareWorkspaceState {
  let raw: Row = {};
  try { raw = JSON.parse(value || "{}") as Row; } catch { /* a corrupt workspace is treated as empty for this retryable job */ }
  return {
    watchlist: list(raw.watchlist), alerts: list(raw.alerts), decisions: list(raw.decisions), members: list(raw.members), channels: list(raw.channels), deliveries: list(raw.deliveries), digest_deliveries: list(raw.digest_deliveries), policies: list(raw.policies), release_events: list(raw.release_events), audit: list(raw.audit), invitations: list(raw.invitations), inventory: { devices: list(jsonValue(raw.inventory).devices), installations: list(jsonValue(raw.inventory).installations), last_import_at: typeof jsonValue(raw.inventory).last_import_at === "string" ? jsonValue(raw.inventory).last_import_at as string : null }, preferences: { ...jsonValue(raw.preferences) },
  };
}

function list(value: unknown): Row[] { return Array.isArray(value) ? value.filter((item): item is Row => Boolean(item && typeof item === "object" && !Array.isArray(item))) : []; }
function inPeriod(value: unknown, start: string, end: string): boolean { const time = new Date(String(value || "")).getTime(); return Number.isFinite(time) && time >= new Date(start).getTime() && time < new Date(end).getTime(); }
function weeklyDue(now: string, weekday: number, hour: number): Date { const date = new Date(now); const current = date.getUTCDay() || 7; const offset = (weekday - current + 7) % 7; const due = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + offset, hour, 0, 0)); return due.getTime() > date.getTime() ? new Date(due.getTime() - 7 * 24 * 60 * 60 * 1000) : due; }
function slackPayload(summary: Record<string, unknown>) { const highlights = Array.isArray(summary.highlights) && summary.highlights.length ? (summary.highlights as string[]).map((item) => `• ${item}`).join("\n") : "No meaningful release changes this week."; return { text: `GuardRails weekly security digest\n${Number(summary.release_changes || 0)} release changes · ${Number(summary.needs_review || 0)} need review\n${highlights}` }; }
