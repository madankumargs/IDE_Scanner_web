import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const settings = fs.readFileSync(
  path.join(root, "app/workspace/NotificationSettings.tsx"),
  "utf8",
);
const center = fs.readFileSync(
  path.join(root, "app/workspace/NotificationCenter.tsx"),
  "utf8",
);
const workspace = fs.readFileSync(
  path.join(root, "app/TeamWorkspace.tsx"),
  "utf8",
);

describe("workspace notifications product surface", () => {
  it("provides a real notification center rather than an inert bell", () => {
    expect(workspace).toContain("<NotificationCenter");
    expect(workspace).toContain("aria-expanded={notificationOpen}");
    expect(center).toContain("Release changes awaiting your team.");
    expect(center).toContain("Delivery needs attention");
  });

  it("supports provider health, test delivery, removal, and explicit empty states", () => {
    for (const copy of [
      "Delivery health",
      "Send test",
      "Remove this channel?",
      "No delivery channel yet.",
      "Latest delivery",
    ])
      expect(settings).toContain(copy);
  });

  it("uses provider-specific fields instead of requiring an unrelated webhook", () => {
    expect(settings).toContain('kind === "email_resend"');
    expect(settings).toContain('name="email"');
    expect(settings).toContain('name="jira_site"');
    expect(settings).toContain('name="webhook_url"');
  });

  it("lets teams control meaningful return events", () => {
    for (const copy of [
      "New extension releases",
      "Analysis completed or failed",
      "Review deadlines",
      "Provenance changes",
      "Coverage changes",
    ])
      expect(settings).toContain(copy);
  });

  it("offers a real weekly Slack and email digest schedule with a live preview", () => {
    for (const copy of [
      "Weekly security digest",
      "A weekly queue of release changes.",
      "Next digest preview",
      "Delivery day",
      "Time (UTC)",
      "Eligible channels",
      "Last digest",
    ])
      expect(settings).toContain(copy);
    expect(settings).toContain("digestPreview.needsReview");
    expect(settings).toContain("slack_webhook");
    expect(settings).toContain("email_resend");
  });
});
