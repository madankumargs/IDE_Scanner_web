import { track } from "@vercel/analytics";

type BaseEvent = {
  source_route: string;
};

export type ProductEvent =
  | (BaseEvent & { name: "public_search_submitted"; query_length: number })
  | (BaseEvent & { name: "catalog_result_opened"; registry: string })
  | (BaseEvent & { name: "public_report_viewed"; public_outcome: string })
  | (BaseEvent & { name: "workspace_signup_started"; entry_point: "deep_scan" | "monitor" | "report" | "account" })
  | (BaseEvent & { name: "workspace_created" })
  | (BaseEvent & { name: "watch_created"; scope: "personal" | "team" })
  | (BaseEvent & { name: "decision_created"; decision: "allow" | "review" | "block" | "exception" })
  | (BaseEvent & { name: "alert_delivered"; channel: "slack" | "email" | "webhook" | "jira" })
  | (BaseEvent & { name: "alert_acknowledged"; scope: "personal" | "team" })
  | (BaseEvent & { name: "team_badge_studio_opened"; badge_count: number })
  | (BaseEvent & { name: "team_badge_scan_requested"; mode: "exact_release" })
  | (BaseEvent & { name: "team_badge_created"; mode: "exact_release" })
  | (BaseEvent & { name: "team_badge_copied"; format: "markdown" | "html" })
  | (BaseEvent & { name: "team_badge_report_opened"; mode: "exact_release" })
  | (BaseEvent & { name: "team_badge_refresh_intent"; mode: "exact_release" });

/**
 * Product events intentionally exclude extension IDs, report content, artifact hashes,
 * user identifiers, email addresses, and notification targets. This makes the adapter
 * safe to import from server-rendered code as well as client interactions.
 */
export function trackProductEvent(event: ProductEvent): void {
  if (typeof window === "undefined") return;
  const { name, ...properties } = event;
  track(name, properties);
}
