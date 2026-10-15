import { expect, test } from "@playwright/test";

const user = {
  id: "user-1",
  email: "reviewer@example.com",
  provider: "cloudflare",
};

test("a signed-in report visitor can create an exact monitoring baseline", async ({
  page,
}) => {
  let watchRequest: Record<string, unknown> | null = null;

  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const json = (body: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(body),
      });

    if (path === "/api/auth/session") return json({ user });
    if (path === "/api/teams") {
      return json({
        teams: [{ id: "team-1", name: "Security", slug: "security", role: "owner" }],
      });
    }
    if (path === "/api/teams/team-1/alerts") return json({ alerts: [] });
    if (path === "/api/teams/team-1/decisions") return json({ decisions: [] });
    if (path === "/api/teams/team-1/members") return json({ members: [] });
    if (path === "/api/teams/team-1/watchlist") {
      if (request.method() === "POST") {
        watchRequest = request.postDataJSON() as Record<string, unknown>;
        return json({
          extension_id: "GitHub.copilot",
          baseline_version: "1.388.0",
          monitoring_state: "monitoring",
        }, 201);
      }
      return json({
        items: [],
        health: {
          status: "healthy",
          last_checked_at: "2026-10-15T00:00:00.000Z",
          next_check_at: "2026-10-15T06:00:00.000Z",
          cadence_hours: 6,
          error: null,
        },
      });
    }
    if (path === "/api/teams/team-1/notification-channels") {
      return json({ channels: [], deliveries: [], digest_deliveries: [], configured: false });
    }
    if (path === "/api/teams/team-1/monitoring-preferences") return json({});
    if (path === "/api/teams/team-1/badges") return json({ badges: [] });
    if (path === "/api/marketplace/search") {
      return json({
        query: "GitHub.copilot",
        exact_match: {
          extension_id: "GitHub.copilot",
          version: "1.388.0",
          display_name: "GitHub Copilot",
          publisher: "GitHub",
          publisher_verified: true,
          registry: "vs-marketplace",
          match_reason: "exact_identity",
          icon_url: "",
          install_count: 1,
          rating_count: 0,
          rating_average: 0,
        },
        matching_extensions: [],
        related_extensions: [],
        matching_publishers: [],
      });
    }
    if (path === "/api/extensions/GitHub.copilot") {
      return json({ scan: { id: "11111111-1111-4111-8111-111111111111" } });
    }
    return route.fulfill({ status: 404, contentType: "application/json", body: "{}" });
  });

  await page.goto("/monitor?extension=GitHub.copilot");
  await expect(
    page.getByRole("heading", { name: "Choose an exact extension release." }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Choose release/i }).click();
  await page.getByRole("button", { name: "Start monitoring" }).click();

  await expect(
    page.getByText("GitHub Copilot is now monitored from 1.388.0."),
  ).toBeVisible();
  expect(watchRequest).toEqual({
    extension_id: "GitHub.copilot",
    version: "1.388.0",
    baseline_scan_id: "11111111-1111-4111-8111-111111111111",
  });
});
