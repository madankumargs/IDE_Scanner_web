import { NextResponse } from "next/server";
import { authenticated } from "@/lib/auth";
import {
  auditManifest,
  filterTeamAuditEvents,
  teamAuditCsv,
  type TeamAuditEvent,
} from "@/lib/teamAudit";
import { teamApiError } from "@/lib/teamApiError";
import { requireTeamRole } from "@/lib/teams";
import { serviceDb } from "@/lib/supabase";
import { requireEntitlement } from "@/lib/entitlements";
import { getWorkspaceState } from "@/lib/cloudflareWorkspace";

export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
type Row = Record<string, unknown>;

export async function GET(request: Request, context: Context) {
  try {
    const { user, provider } = await authenticated(request);
    const { id } = await context.params;
    const role = await requireTeamRole(id, user.id, [
      "owner",
      "admin",
      "analyst",
      "viewer",
    ]);
    const url = new URL(request.url);
    const format = url.searchParams.get("format") || "json";
    const wantsDownload =
      format === "csv" || url.searchParams.get("download") === "1";
    const filters = {
      actor: url.searchParams.get("actor") || undefined,
      extension: url.searchParams.get("extension") || undefined,
      version: url.searchParams.get("version") || undefined,
      eventType: url.searchParams.get("event_type") || undefined,
      risk: url.searchParams.get("risk") || undefined,
      decision: url.searchParams.get("decision") || undefined,
      deliveryStatus: url.searchParams.get("delivery_status") || undefined,
      from: url.searchParams.get("from") || undefined,
      to: url.searchParams.get("to") || undefined,
    };
    if (wantsDownload && role === "viewer") {
      return NextResponse.json(
        { error: "Viewer access does not include audit export." },
        { status: 403 },
      );
    }
    if (provider === "cloudflare") {
      const workspace = await getWorkspaceState(id);
      const events = filterTeamAuditEvents(workspace.audit as TeamAuditEvent[], filters);
      const visibleEvents = role === "analyst" || role === "viewer" ? events.filter((event) => ["decision", "monitoring", "badge"].includes(event.object_type)) : events;
      const manifest = auditManifest(id, visibleEvents);
      if (format === "csv") return new Response(teamAuditCsv(visibleEvents), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="guardrails-audit-${id}.csv"`, "X-GuardRails-SHA256": manifest.sha256, "Cache-Control": "private, no-store" } });
      return NextResponse.json({ manifest, events: visibleEvents }, { headers: { "Cache-Control": "private, no-store" } });
    }
    if (wantsDownload) await requireEntitlement(id, "audit_export");

    const db = serviceDb();
    const bounds = auditBounds(filters);
    filters.from = bounds.from;
    filters.to = bounds.to;
    let decisionsQuery = db
      .from("team_decisions")
      .select(
        "id,extension_id,version,rationale,updated_at,team_decision_events(id,actor_id,kind,before_value,after_value,created_at)",
      )
      .eq("team_id", id)
      .order("updated_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(500);
    let alertsQuery = db
      .from("team_monitoring_alerts")
      .select(
        "id,kind,title,extension_id,version,severity,state,metadata,created_at,resolved_at",
      )
      .eq("team_id", id)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(500);
    let deliveriesQuery = db
      .from("team_notification_deliveries")
      .select(
        "id,status,attempts,delivered_at,last_error,created_at,team_monitoring_alerts(extension_id,version,severity)",
      )
      .eq("team_id", id)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(500);
    let digestsQuery = db
      .from("team_digest_deliveries")
      .select(
        "id,status,attempts,delivered_at,last_error,period_start,period_end,created_at,snapshot",
      )
      .eq("team_id", id)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(250);
    let domainEventsQuery = db
      .from("team_audit_events")
      .select(
        "id,actor_id,action,object_type,object_id,extension_id,version,previous_state,resulting_state,rationale,risk_level,created_at",
      )
      .eq("team_id", id)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(500);
    if (bounds.from) {
      decisionsQuery = decisionsQuery.gte("updated_at", bounds.from);
      alertsQuery = alertsQuery.gte("created_at", bounds.from);
      deliveriesQuery = deliveriesQuery.gte("created_at", bounds.from);
      digestsQuery = digestsQuery.gte("created_at", bounds.from);
      domainEventsQuery = domainEventsQuery.gte("created_at", bounds.from);
    }
    if (bounds.to) {
      decisionsQuery = decisionsQuery.lte("updated_at", bounds.to);
      alertsQuery = alertsQuery.lte("created_at", bounds.to);
      deliveriesQuery = deliveriesQuery.lte("created_at", bounds.to);
      digestsQuery = digestsQuery.lte("created_at", bounds.to);
      domainEventsQuery = domainEventsQuery.lte("created_at", bounds.to);
    }
    const [decisions, alerts, deliveries, digests, domainEvents] =
      await Promise.all([
        decisionsQuery,
        alertsQuery,
        deliveriesQuery,
        digestsQuery,
        domainEventsQuery,
      ]);
    const failure = [decisions, alerts, deliveries, digests, domainEvents].find(
      (result) => result.error,
    );
    if (failure?.error) throw failure.error;

    const events = filterTeamAuditEvents(
      normalizeEvents(id, {
        decisions: decisions.data || [],
        alerts: alerts.data || [],
        deliveries: deliveries.data || [],
        digests: digests.data || [],
        domainEvents: domainEvents.data || [],
      }),
      filters,
    );
    const visibleEvents =
      role === "analyst" || role === "viewer"
        ? events.filter((event) =>
            ["decision", "monitoring", "badge"].includes(event.object_type),
          )
        : events;
    const manifest = auditManifest(id, visibleEvents);

    if (format === "csv") {
      return new Response(teamAuditCsv(visibleEvents), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="guardrails-audit-${id}.csv"`,
          "X-GuardRails-SHA256": manifest.sha256,
          "Cache-Control": "private, no-store",
        },
      });
    }
    return NextResponse.json(
      { manifest, events: visibleEvents },
      {
        headers: wantsDownload
          ? {
              "Content-Disposition": `attachment; filename="guardrails-audit-${id}.json"`,
              "Cache-Control": "private, no-store",
            }
          : { "Cache-Control": "private, no-store" },
      },
    );
  } catch (error) {
    const failure = teamApiError(
      error,
      "Workspace audit history is temporarily unavailable.",
    );
    return NextResponse.json(
      { error: failure.error },
      { status: failure.status },
    );
  }
}

function normalizeEvents(
  workspaceId: string,
  sources: {
    decisions: Row[];
    alerts: Row[];
    deliveries: Row[];
    digests: Row[];
    domainEvents: Row[];
  },
): TeamAuditEvent[] {
  const events: TeamAuditEvent[] = [];
  for (const event of sources.domainEvents) {
    const objectType = domainObjectType(event.object_type);
    const rawAction = String(event.action);
    events.push({
      event_id: String(event.id),
      workspace_id: workspaceId,
      actor_id: text(event.actor_id),
      action: rawAction.startsWith("team_badge_")
        ? rawAction
        : `${objectType}_${rawAction}`,
      object_type: objectType,
      object_id: String(event.object_id),
      extension_id: text(event.extension_id),
      version: text(event.version),
      previous_state: nullableObject(event.previous_state),
      resulting_state: nullableObject(event.resulting_state),
      rationale: text(event.rationale),
      risk_level: text(event.risk_level),
      receipt_id: String(event.id),
      occurred_at: String(event.created_at),
    });
  }
  for (const decision of sources.decisions) {
    for (const event of many(decision.team_decision_events)) {
      const after = object(event.after_value);
      events.push({
        event_id: String(event.id),
        workspace_id: workspaceId,
        actor_id: text(event.actor_id),
        action: String(event.kind || "decision_updated"),
        object_type: "decision",
        object_id: String(decision.id),
        extension_id: text(decision.extension_id),
        version: text(decision.version),
        previous_state: object(event.before_value),
        resulting_state: after,
        rationale: text(after.rationale) || text(decision.rationale),
        risk_level: null,
        receipt_id: String(event.id),
        occurred_at: String(event.created_at),
      });
    }
  }
  for (const alert of sources.alerts) {
    events.push({
      event_id: String(alert.id),
      workspace_id: workspaceId,
      actor_id: null,
      action: String(alert.kind || "monitoring_alert"),
      object_type: "monitoring",
      object_id: String(alert.id),
      extension_id: text(alert.extension_id),
      version: text(alert.version),
      previous_state: null,
      resulting_state: { state: alert.state, metadata: object(alert.metadata) },
      rationale: text(alert.title),
      risk_level: text(alert.severity),
      receipt_id: String(alert.id),
      occurred_at: String(alert.created_at),
    });
  }
  for (const delivery of sources.deliveries) {
    const alert = one(delivery.team_monitoring_alerts);
    events.push({
      event_id: String(delivery.id),
      workspace_id: workspaceId,
      actor_id: null,
      action: `delivery_${String(delivery.status || "unknown")}`,
      object_type: "notification",
      object_id: String(delivery.id),
      extension_id: text(alert.extension_id),
      version: text(alert.version),
      previous_state: null,
      resulting_state: {
        status: delivery.status,
        attempts: delivery.attempts,
        delivered_at: delivery.delivered_at,
        error: delivery.last_error,
      },
      rationale: null,
      risk_level: text(alert.severity),
      receipt_id: String(delivery.id),
      occurred_at: String(delivery.delivered_at || delivery.created_at),
    });
  }
  for (const digest of sources.digests) {
    events.push({
      event_id: String(digest.id),
      workspace_id: workspaceId,
      actor_id: null,
      action: `digest_${String(digest.status || "unknown")}`,
      object_type: "digest",
      object_id: String(digest.id),
      extension_id: null,
      version: null,
      previous_state: null,
      resulting_state: {
        status: digest.status,
        attempts: digest.attempts,
        period_start: digest.period_start,
        period_end: digest.period_end,
        snapshot: object(digest.snapshot),
        error: digest.last_error,
      },
      rationale: null,
      risk_level: null,
      receipt_id: String(digest.id),
      occurred_at: String(digest.delivered_at || digest.created_at),
    });
  }
  return events;
}

function many(value: unknown): Row[] {
  return Array.isArray(value) ? (value as Row[]) : [];
}
function one(value: unknown): Row {
  return Array.isArray(value) ? ((value[0] || {}) as Row) : object(value);
}
function object(value: unknown): Row {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Row)
    : {};
}
function nullableObject(value: unknown): Row | null {
  const result = object(value);
  return Object.keys(result).length ? result : null;
}
function text(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}
function domainObjectType(value: unknown): TeamAuditEvent["object_type"] {
  const mapping: Record<string, TeamAuditEvent["object_type"]> = {
    team_members: "membership",
    team_invitations: "invitation",
    team_watchlist_items: "watchlist",
    team_notification_channels: "channel",
    team_monitoring_preferences: "preference",
    team_monitoring_alerts: "monitoring",
    badge: "badge",
  };
  return mapping[String(value)] || "unknown";
}

function auditBounds(filters: { from?: string; to?: string }) {
  const from = validTimestamp(filters.from);
  const to = validTimestamp(filters.to);
  return { from, to };
}

function validTimestamp(value: string | undefined) {
  if (!value || Number.isNaN(new Date(value).getTime())) return undefined;
  return value;
}
