import { describe, expect, it } from "vitest";
import { evaluatePublicStatus } from "@/lib/publicStatus";
const ready = {
  accepting_requests: true,
  status: "ready" as const,
  last_seen_at: "2026-08-07T11:00:00.000Z",
};
describe("public product status", () => {
  it("reports operational only when every measured service is healthy", () => {
    const value = evaluatePublicStatus({
      runner: ready,
      newestRegistryRefresh: "2026-08-07T10:00:00.000Z",
      scanFailureRate: 0.01,
      notificationFailureRate: 0,
      databaseReachable: true,
      now: new Date("2026-08-07T11:00:00.000Z"),
    });
    expect(value.overall).toBe("operational");
    expect(value.services).toHaveLength(5);
  });
  it("reports unknown instead of inventing a healthy result", () => {
    const value = evaluatePublicStatus({
      runner: ready,
      newestRegistryRefresh: null,
      scanFailureRate: null,
      notificationFailureRate: null,
      databaseReachable: true,
    });
    expect(value.overall).toBe("unknown");
    expect(
      value.services.filter((item) => item.state === "unknown"),
    ).toHaveLength(3);
  });
  it("lets an active incident degrade healthy service checks", () => {
    const value = evaluatePublicStatus({
      runner: ready,
      newestRegistryRefresh: new Date().toISOString(),
      scanFailureRate: 0,
      notificationFailureRate: 0,
      databaseReachable: true,
      incidents: [
        {
          id: "1",
          title: "Delayed alerts",
          status: "monitoring",
          impact: "minor",
          started_at: new Date().toISOString(),
          resolved_at: null,
          summary: "Delivery recovery is being monitored.",
        },
      ],
    });
    expect(value.overall).toBe("degraded");
  });

  it("uses the active Cloudflare registry publication timestamp for freshness", () => {
    const value = evaluatePublicStatus({
      runner: ready,
      newestRegistryRefresh: "2026-08-07T10:00:00.000Z",
      scanFailureRate: 0,
      notificationFailureRate: 0,
      databaseReachable: true,
      now: new Date("2026-08-07T11:00:00.000Z"),
    });
    expect(value.services.find((item) => item.id === "registry")).toMatchObject({
      state: "operational",
      detail: "Last successful refresh 1 hr ago.",
    });
  });
});
