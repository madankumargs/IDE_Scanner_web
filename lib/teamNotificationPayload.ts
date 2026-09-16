import { isIP } from "node:net";

type Alert = Record<string, unknown>;

export function genericWebhookMessage(alert: Alert) {
  const site = process.env.NEXT_PUBLIC_SITE_URL || "https://abscissa.dev";
  const extensionId = String(alert.extension_id || ""); const version = String(alert.version || "");
  const metadata = alert.metadata && typeof alert.metadata === "object" && !Array.isArray(alert.metadata) ? alert.metadata as Record<string, unknown> : {};
  return {
    event: "guardrails.monitoring_alert",
    alert: { id: String(alert.id || ""), kind: String(alert.kind || ""), severity: alert.severity || "INFORMATIONAL", title: String(alert.title || ""), summary: String(alert.summary || ""), created_at: String(alert.created_at || "") },
    artifact: { extension_id: extensionId, version, report_url: `${site}/extensions/${encodeURIComponent(extensionId)}/versions/${encodeURIComponent(version)}` },
    badge: { refresh_recommended: metadata.badge_refresh_recommended === true, baseline_version: typeof metadata.baseline_version === "string" ? metadata.baseline_version : null },
  };
}

export function isSafeWebhookUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || !url.hostname || url.port) return false;
    if (url.hostname === "localhost" || url.hostname.endsWith(".localhost") || url.hostname.endsWith(".local")) return false;
    return !isPrivateAddress(url.hostname);
  } catch { return false; }
}

function isPrivateAddress(host: string): boolean {
  if (!isIP(host)) return false;
  if (host === "::1" || host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80:" )) return true;
  const [first, second] = host.split(".").map(Number);
  return first === 10 || first === 127 || first === 0 || first === 169 && second === 254 || first === 172 && second >= 16 && second <= 31 || first === 192 && second === 168;
}
