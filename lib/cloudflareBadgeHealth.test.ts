import { describe, expect, it, vi } from "vitest";
import { reconcileCloudflareBadgeHealth } from "./cloudflareBadgeHealth";

function database() {
  const run = vi.fn().mockResolvedValue({ success: true });
  const updates: string[] = [];
  const db = {
    prepare: vi.fn((query: string) => ({
      bind: vi.fn((...values: unknown[]) => ({
        all: query.includes("registry_section_chunks")
          ? vi.fn().mockResolvedValue({ results: [{ payload: JSON.stringify([
              { id: "publisher.extension", latest_version: "1.2.4" },
            ]) }] })
          : vi.fn().mockResolvedValue({ results: [{ team_id: "team-1", state_json: JSON.stringify({
              watchlist: [{ extension_id: "Publisher.Extension", baseline_version: "1.2.3", last_observed_version: "1.2.3" }],
              release_events: [],
              audit: [],
            }) }] }),
        first: vi.fn().mockResolvedValue(null),
        run: vi.fn(async () => {
          updates.push(String(values[0]));
          return run();
        }),
      })),
    })),
  } as unknown as D1Database;
  return { db, run, updates };
}

describe("Cloudflare badge health reconciliation", () => {
  it("advances a watched release and creates one durable release event", async () => {
    const { db, updates } = database();
    await expect(reconcileCloudflareBadgeHealth(db, "2026-09-16T10:00:00.000Z")).resolves.toEqual({
      teams_checked: 1,
      teams_changed: 1,
      releases_detected: 1,
    });
    const state = JSON.parse(updates[0]) as Record<string, unknown>;
    expect(state.watchlist).toEqual([expect.objectContaining({ last_observed_version: "1.2.4" })]);
    expect(state.release_events).toEqual([expect.objectContaining({
      extension_id: "Publisher.Extension",
      target_version: "1.2.4",
      state: "release_detected",
    })]);
    expect(state.audit).toEqual([expect.objectContaining({ action: "team_release_detected", actor_id: null })]);
  });

  it("does not rewrite state when the catalog has no newer release", async () => {
    const { db } = database();
    const prepare = vi.mocked(db.prepare);
    prepare.mockImplementation((query: string) => ({
      bind: vi.fn(() => ({
        all: vi.fn().mockResolvedValue(query.includes("registry_section_chunks")
          ? { results: [{ payload: JSON.stringify([{ id: "publisher.extension", latest_version: "1.2.3" }]) }] }
          : { results: [{ team_id: "team-1", state_json: JSON.stringify({ watchlist: [{ extension_id: "publisher.extension", baseline_version: "1.2.3" }] }) }] }),
      })),
    }) as never);
    await expect(reconcileCloudflareBadgeHealth(db, "2026-09-16T10:00:00.000Z")).resolves.toEqual({
      teams_checked: 1,
      teams_changed: 0,
      releases_detected: 0,
    });
  });
});
