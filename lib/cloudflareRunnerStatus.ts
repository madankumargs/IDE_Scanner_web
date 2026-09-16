import "server-only";

import type { PrivateDatabase } from "@/lib/cloudflarePrivate";

type RunnerRow = Record<string, unknown>;

const RUNNER_STATUS_ID = "github-actions";

export async function recordCloudflareRunnerHeartbeat(db: PrivateDatabase, runnerId: string, timestamp: string): Promise<void> {
  await db.prepare(
    `INSERT INTO app_scan_runner_status(id,runner_id,last_seen_at,updated_at)
     VALUES(?,?,?,?)
     ON CONFLICT(id) DO UPDATE SET
       runner_id=excluded.runner_id,
       last_seen_at=excluded.last_seen_at,
       updated_at=excluded.updated_at`,
  ).bind(RUNNER_STATUS_ID, runnerId, timestamp, timestamp).run();
}

export async function markCloudflareRunnerClaimed(db: PrivateDatabase, timestamp: string): Promise<void> {
  await db.prepare(
    "UPDATE app_scan_runner_status SET last_claimed_at=?,updated_at=? WHERE id=?",
  ).bind(timestamp, timestamp, RUNNER_STATUS_ID).run();
}

export async function markCloudflareRunnerCompleted(db: PrivateDatabase, timestamp: string): Promise<void> {
  await db.prepare(
    "UPDATE app_scan_runner_status SET last_completed_at=?,updated_at=?,last_error=NULL WHERE id=?",
  ).bind(timestamp, timestamp, RUNNER_STATUS_ID).run();
}

export async function markCloudflareRunnerError(db: PrivateDatabase, error: string, timestamp: string): Promise<void> {
  await db.prepare(
    "UPDATE app_scan_runner_status SET last_error=?,updated_at=? WHERE id=?",
  ).bind(error.slice(0, 2000), timestamp, RUNNER_STATUS_ID).run();
}

export async function getCloudflareRunnerHeartbeat(db: PrivateDatabase): Promise<string | null> {
  const row = await db.prepare(
    "SELECT last_seen_at FROM app_scan_runner_status WHERE id=? LIMIT 1",
  ).bind(RUNNER_STATUS_ID).first<RunnerRow>();
  return row?.last_seen_at ? String(row.last_seen_at) : null;
}
