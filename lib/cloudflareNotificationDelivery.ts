import { emailDeliveryConfigured } from "@/lib/emailNotification";
import { jiraAuthorization, jiraIssuePayload, parseJiraTarget } from "@/lib/jiraNotification";
import { isSafeWebhookUrl } from "@/lib/teamNotificationPayload";
import { runtimeEnv } from "@/lib/runtimeEnv";

type JsonObject = Record<string, unknown>;

export type CloudflareDeliveryRequest = {
  destination: string;
  payload: JsonObject;
  headers: Record<string, string>;
};

export function cloudflareNotificationProvider(
  kind: string,
  target: string,
  payload: unknown,
): string {
  const input = object(payload);
  if (typeof input.provider === "string" && input.provider) return input.provider;
  if (["slack_webhook", "generic_webhook", "jira_cloud", "email_resend"].includes(kind)) return kind;
  if (/^https:\/\/hooks\.slack\.com\/services\//.test(target)) return "slack_webhook";
  if (target.trim().startsWith("{")) return "jira_cloud";
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(target)) return "email_resend";
  return "generic_webhook";
}

/** Convert a D1 delivery into a validated provider request at send time. */
export function cloudflareNotificationRequest(
  kind: string,
  target: string,
  payload: unknown,
): CloudflareDeliveryRequest {
  const provider = kind || "generic_webhook";
  const input = object(payload);
  if (provider === "slack_webhook") {
    if (!isSlackWebhook(target)) throw new Error("The stored Slack target is no longer allowed.");
    return {
      destination: target,
      payload: input.text ? withoutProvider(input) : { text: releaseText(input) },
      headers: { "X-GuardRails-Event": String(input.event || "monitoring_alert") },
    };
  }
  if (provider === "generic_webhook") {
    if (!isSafeWebhookUrl(target)) throw new Error("The stored webhook target is no longer allowed.");
    return { destination: target, payload: withoutProvider(input), headers: { "X-GuardRails-Event": String(input.event || "monitoring_alert") } };
  }
  if (provider === "jira_cloud") {
    const jira = parseJiraTarget(target);
    return {
      destination: `${jira.site}/rest/api/3/issue`,
      payload: jiraIssuePayload(normalizeAlert(input), jira.project_key),
      headers: { Authorization: jiraAuthorization(jira), Accept: "application/json" },
    };
  }
  if (provider === "email_resend") {
    if (!emailDeliveryConfigured()) throw new Error("Email delivery is not configured by the service operator.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(target) || target.length > 254) throw new Error("The stored notification email is invalid.");
    return {
      destination: "https://api.resend.com/emails",
      payload: emailPayload(input, target),
      headers: { Authorization: `Bearer ${runtimeEnv("RESEND_API_KEY")}`, Accept: "application/json" },
    };
  }
  throw new Error("This notification provider is not supported.");
}

function emailPayload(input: JsonObject, recipient: string): JsonObject {
  const site = runtimeEnv("NEXT_PUBLIC_SITE_URL") || "https://abscissa.dev";
  if (String(input.event) === "guardrails.weekly_digest") {
    const highlights = Array.isArray(input.highlights) && input.highlights.length
      ? input.highlights.map((item) => `- ${String(item)}`).join("\n")
      : "- No meaningful release changes this week.";
    return {
      from: runtimeEnv("NOTIFICATION_FROM_EMAIL"),
      to: [recipient],
      subject: "[GuardRails] Weekly security digest",
      text: `GuardRails weekly security digest\n\n${Number(input.release_changes || 0)} release changes\n${Number(input.needs_review || 0)} items need review\n${Number(input.decisions_recorded || 0)} decisions recorded\n\nHighlights\n${highlights}\n\nOpen review inbox: ${site}/workspace`,
    };
  }
  const extension = String(input.extension_id || "extension");
  const version = String(input.target_version || input.version || "");
  const baseline = String(input.baseline_version || "reviewed baseline");
  return {
    from: runtimeEnv("NOTIFICATION_FROM_EMAIL"),
    to: [recipient],
    subject: `[GuardRails] Release change: ${extension}@${version}`,
    text: `${String(input.message || "A watched extension release changed.")}\n\nReviewed baseline: ${extension}@${baseline}\nNew artifact: ${extension}@${version}\n\nOpen evidence: ${site}/extensions/${encodeURIComponent(extension)}/versions/${encodeURIComponent(version)}`,
  };
}

function normalizeAlert(input: JsonObject): JsonObject {
  return {
    ...input,
    extension_id: input.extension_id || "extension",
    version: input.target_version || input.version || "",
    kind: input.kind || "release_detected",
    severity: input.severity || "INFORMATIONAL",
    title: input.title || `New release detected: ${String(input.extension_id || "extension")}`,
    summary: input.summary || input.message || "A watched extension release changed.",
  };
}

function releaseText(input: JsonObject): string {
  return `${String(input.extension_id || "extension")}@${String(input.target_version || input.version || "new release")}: ${String(input.message || input.summary || "A watched extension release changed.")}`;
}

function withoutProvider(input: JsonObject): JsonObject {
  const publicPayload = { ...input };
  delete publicPayload.provider;
  return publicPayload;
}

function object(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : {};
}

function isSlackWebhook(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "hooks.slack.com" && /^\/services\/[A-Z0-9]+\/[A-Z0-9]+\/[A-Za-z0-9]+$/.test(url.pathname);
  } catch {
    return false;
  }
}
