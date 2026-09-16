import { describe, expect, it, vi } from "vitest";
import {
  getCloudflareRunnerHeartbeat,
  markCloudflareRunnerClaimed,
  markCloudflareRunnerCompleted,
  markCloudflareRunnerError,
  recordCloudflareRunnerHeartbeat,
} from "@/lib/cloudflareRunnerStatus";

function database() {
  const statements: Array<{ query: string; values: unknown[] }> = [];
  const db = {
    prepare: vi.fn((query: string) => {
      const statement = {
        bind: vi.fn((...values: unknown[]) => {
          statements.push({ query, values });
          return {
            run: vi.fn(async () => ({ results: [], meta: { changes: 1 } })),
            first: vi.fn(async () => ({ last_seen_at: "2026-09-16T17:00:00.000Z" })),
          };
        }),
      };
      return statement;
    }),
  };
  return { db, statements };
}

describe("Cloudflare runner status", () => {
  it("records an empty-queue heartbeat and exposes it to health checks", async () => {
    const { db, statements } = database();
    await recordCloudflareRunnerHeartbeat(db as never, "github-actions-42", "2026-09-16T17:00:00.000Z");
    await markCloudflareRunnerClaimed(db as never, "2026-09-16T17:00:01.000Z");
    await markCloudflareRunnerCompleted(db as never, "2026-09-16T17:00:02.000Z");
    await markCloudflareRunnerError(db as never, "temporary callback failure", "2026-09-16T17:00:03.000Z");
    await expect(getCloudflareRunnerHeartbeat(db as never)).resolves.toBe("2026-09-16T17:00:00.000Z");
    expect(statements[0]).toMatchObject({ values: ["github-actions", "github-actions-42", "2026-09-16T17:00:00.000Z", "2026-09-16T17:00:00.000Z"] });
    expect(statements.map((statement) => statement.query)).toEqual([
      expect.stringContaining("INSERT INTO app_scan_runner_status"),
      "UPDATE app_scan_runner_status SET last_claimed_at=?,updated_at=? WHERE id=?",
      "UPDATE app_scan_runner_status SET last_completed_at=?,updated_at=?,last_error=NULL WHERE id=?",
      "UPDATE app_scan_runner_status SET last_error=?,updated_at=? WHERE id=?",
      "SELECT last_seen_at FROM app_scan_runner_status WHERE id=? LIMIT 1",
    ]);
  });
});
