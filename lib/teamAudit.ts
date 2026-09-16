import { createHash } from "node:crypto";

export type TeamAuditEvent = {
  event_id: string;
  workspace_id: string;
  actor_id: string | null;
  action: string;
  object_type:
    | "decision"
    | "monitoring"
    | "notification"
    | "digest"
    | "membership"
    | "invitation"
    | "watchlist"
    | "channel"
    | "preference"
    | "badge"
    | "unknown";
  object_id: string;
  extension_id: string | null;
  version: string | null;
  previous_state: Record<string, unknown> | null;
  resulting_state: Record<string, unknown> | null;
  rationale: string | null;
  risk_level: string | null;
  receipt_id: string;
  occurred_at: string;
};

export type TeamAuditFilters = {
  actor?: string;
  extension?: string;
  version?: string;
  eventType?: string;
  risk?: string;
  decision?: string;
  deliveryStatus?: string;
  from?: string;
  to?: string;
};

export function filterTeamAuditEvents(
  events: TeamAuditEvent[],
  filters: TeamAuditFilters,
) {
  const from = filters.from ? new Date(filters.from).getTime() : null;
  const to = filters.to ? new Date(filters.to).getTime() : null;
  return events
    .filter((event) => !filters.actor || event.actor_id === filters.actor)
    .filter(
      (event) =>
        !filters.extension ||
        event.extension_id
          ?.toLowerCase()
          .includes(filters.extension.toLowerCase()),
    )
    .filter((event) => !filters.version || event.version === filters.version)
    .filter(
      (event) =>
        !filters.eventType ||
        event.object_type === filters.eventType ||
        event.action === filters.eventType,
    )
    .filter(
      (event) =>
        !filters.decision ||
        event.resulting_state?.decision === filters.decision,
    )
    .filter(
      (event) =>
        !filters.deliveryStatus ||
        event.resulting_state?.status === filters.deliveryStatus,
    )
    .filter(
      (event) =>
        !filters.risk ||
        event.risk_level?.toLowerCase() === filters.risk.toLowerCase(),
    )
    .filter(
      (event) => from == null || new Date(event.occurred_at).getTime() >= from,
    )
    .filter(
      (event) => to == null || new Date(event.occurred_at).getTime() <= to,
    )
    .sort(
      (a, b) =>
        b.occurred_at.localeCompare(a.occurred_at) ||
        b.event_id.localeCompare(a.event_id),
    );
}

export function auditManifest(workspaceId: string, events: TeamAuditEvent[]) {
  const canonical = JSON.stringify(events);
  return {
    schema: "guardrails.workspace-audit.v1",
    workspace_id: workspaceId,
    event_count: events.length,
    generated_at: new Date().toISOString(),
    sha256: createHash("sha256").update(canonical).digest("hex"),
  };
}

const csvColumns: Array<keyof TeamAuditEvent> = [
  "event_id",
  "workspace_id",
  "actor_id",
  "action",
  "object_type",
  "object_id",
  "extension_id",
  "version",
  "risk_level",
  "rationale",
  "receipt_id",
  "occurred_at",
  "previous_state",
  "resulting_state",
];

export function teamAuditCsv(events: TeamAuditEvent[]) {
  const rows = events.map((event) =>
    csvColumns.map((column) => csvCell(event[column])).join(","),
  );
  return [csvColumns.join(","), ...rows].join("\n");
}

function csvCell(value: unknown) {
  if (value == null) return "";
  const text =
    typeof value === "object" ? JSON.stringify(value) : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}
