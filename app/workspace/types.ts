import type { QueueDecision } from "@/lib/teamDecisionQueue";

export type Team = { id: string; name: string; slug: string; role: string };
export type Delivery = {
  status: string;
  attempts: number;
  delivered_at: string | null;
  last_error: string | null;
  next_attempt_at: string | null;
};
export type Alert = {
  id: string;
  title: string;
  summary: string;
  severity: string | null;
  state: string;
  extension_id: string;
  version: string;
  team_notification_deliveries?: Delivery[];
};
export type Member = {
  user_id: string;
  role: string;
  profiles?:
    | { display_name?: string | null }
    | Array<{ display_name?: string | null }>
    | null;
};
export type WatchItem = {
  extension_id: string;
  created_at: string;
  baseline_version?: string | null;
  monitoring_state?: string;
  last_observed_version?: string | null;
  last_event_at?: string | null;
  extensions?:
    | { display_name?: string }
    | Array<{ display_name?: string }>
    | null;
};
export type MonitoringHealth = {
  status: "healthy" | "degraded" | "unknown";
  last_checked_at: string | null;
  next_check_at: string | null;
  cadence_hours: number;
  error: string | null;
};
export type DecisionReceipt = {
  decisionId: string;
  eventId: string;
  decision: string;
  extensionId: string;
  version: string;
  rationale: string;
  recordedAt: string;
};
export type DecisionSaveResult =
  | { ok: true; receipt: DecisionReceipt }
  | { ok: false; error: string };
export type View =
  | "overview"
  | "inventory"
  | "inbox"
  | "extensions"
  | "badges"
  | "decisions"
  | "activity"
  | "settings";
export type { QueueDecision };
