import { describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
const from = vi.fn();
const { getPublicRegistrySnapshot } = vi.hoisted(() => ({ getPublicRegistrySnapshot: vi.fn() }));
vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn }));
vi.mock("@/lib/supabase", () => ({ publicDb: () => ({ rpc, from }) }));
vi.mock("@/lib/publicRegistrySnapshot", () => ({ getPublicRegistrySnapshot }));
import { getPublicMetrics } from "./publicMetrics";

const attestedRelease = {
  data: {
    accuracy_gate_corpus_id: "publication-holdout",
    accuracy_gate_corpus_version: "2026-09-19",
    accuracy_gate_sha256: "a".repeat(64),
  },
  error: null,
};

function mockDatabase(release: { data: Record<string, unknown> | null; error: unknown } = attestedRelease, refreshData: unknown[] = []) {
  from.mockImplementation((table: string) => {
    if (table === "scan_publication_releases") {
      return { select: () => ({ eq: () => ({ maybeSingle: async () => release }) }) };
    }
    return {
      select: () => ({
        eq: () => ({
          order: () => ({ limit: async () => ({ data: refreshData }) }),
        }),
      }),
    };
  });
}

function resetMocks() {
  rpc.mockReset();
  from.mockReset();
  getPublicRegistrySnapshot.mockReset();
  getPublicRegistrySnapshot.mockResolvedValue(null);
}

describe("public intelligence metrics", () => {
  it("does not expose live metrics without an attested active release", async () => {
    resetMocks();
    mockDatabase({ data: null, error: null });
    rpc.mockResolvedValue({ error: null, data: [{ indexed_extensions: 999, exact_releases_analyzed: 999 }] });
    expect((await getPublicMetrics()).exact_releases_analyzed).toBeNull();
  });

  it("does not invent metrics when the aggregate function is unavailable", async () => {
    resetMocks();
    mockDatabase();
    rpc.mockResolvedValue({ error: new Error("migration pending"), data: null });
    expect((await getPublicMetrics()).exact_releases_analyzed).toBeNull();
  });

  it("publishes distinct aggregate counts and waits for a latency denominator", async () => {
    resetMocks();
    mockDatabase(attestedRelease, [{ registry: "vs-marketplace", completed_at: "2026-07-15T00:00:00Z" }]);
    rpc.mockResolvedValue({ error: null, data: [{ indexed_extensions: 7, exact_releases_indexed: 12, exact_releases_analyzed: 10, analyzer_complete_reports: 9, known_bad_artifacts: 1, block_decisions: 1, high_risk_reviews: 2, latency_sample_size: 19, median_minutes: 4, p95_minutes: 20 }] });
    const metrics = await getPublicMetrics();
    expect(metrics).toMatchObject({ indexed_extensions: 7, exact_releases_analyzed: 10, known_bad_artifacts: 1 });
    expect(metrics.time_to_analysis.status).toBe("not_measured");
  });
});
