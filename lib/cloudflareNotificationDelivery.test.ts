import { afterEach, describe, expect, it, vi } from "vitest";
import { cloudflareNotificationProvider, cloudflareNotificationRequest } from "./cloudflareNotificationDelivery";

describe("Cloudflare notification delivery shaping", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("keeps already-queued legacy deliveries compatible during rollout", () => {
    expect(cloudflareNotificationProvider("badge_refresh_recommended", "https://hooks.slack.com/services/A/B/token", {})).toBe("slack_webhook");
    expect(cloudflareNotificationProvider("weekly_digest", "security@example.com", {})).toBe("email_resend");
  });

  it("keeps generic webhook payloads public and strips internal provider metadata", () => {
    const request = cloudflareNotificationRequest("generic_webhook", "https://example.com/hook", {
      provider: "generic_webhook",
      event: "guardrails.badge_refresh_recommended",
      extension_id: "publisher.extension",
      target_version: "2.0.0",
    });
    expect(request.destination).toBe("https://example.com/hook");
    expect(request.payload).toMatchObject({ event: "guardrails.badge_refresh_recommended" });
    expect(request.payload).not.toHaveProperty("provider");
  });

  it("turns a badge release into a Slack-compatible message", () => {
    const request = cloudflareNotificationRequest("slack_webhook", "https://hooks.slack.com/services/A/B/token", {
      provider: "slack_webhook",
      event: "guardrails.badge_refresh_recommended",
      extension_id: "publisher.extension",
      target_version: "2.0.0",
      message: "Refresh the exact badge.",
    });
    expect(request.payload).toEqual({ text: "publisher.extension@2.0.0: Refresh the exact badge." });
  });

  it("creates a Jira issue request from a Cloudflare release payload", () => {
    const request = cloudflareNotificationRequest(
      "jira_cloud",
      JSON.stringify({ site: "https://acme.atlassian.net", email: "security@acme.test", api_token: "secret", project_key: "SEC" }),
      { extension_id: "publisher.extension", target_version: "2.0.0", message: "Refresh the exact badge." },
    );
    expect(request.destination).toBe("https://acme.atlassian.net/rest/api/3/issue");
    expect(request.payload).toMatchObject({ fields: { project: { key: "SEC" }, labels: ["guardrails-monitoring"] } });
    expect(request.headers.Authorization).toMatch(/^Basic /);
  });

  it("creates a Resend request for a configured email channel", () => {
    vi.stubEnv("RESEND_API_KEY", "re_test");
    vi.stubEnv("NOTIFICATION_FROM_EMAIL", "alerts@example.com");
    const request = cloudflareNotificationRequest("email_resend", "security@example.com", {
      event: "guardrails.weekly_digest",
      release_changes: 2,
      needs_review: 1,
      decisions_recorded: 3,
      highlights: ["publisher.extension@2.0.0: release change"],
    });
    expect(request.destination).toBe("https://api.resend.com/emails");
    expect(request.payload).toMatchObject({ from: "alerts@example.com", to: ["security@example.com"] });
    expect(request.headers.Authorization).toBe("Bearer re_test");
  });
});
